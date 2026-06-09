import type { EngineRequest } from "./exchangeStore"
import { connectWriteClient, writeClient } from "./exchangeStore"
import { handleCreateOrder } from "./handlers/createOrder"
import { handleCancelOrder } from "./handlers/cancelOrder"
import {  handleGetDepth } from "./handlers/getDepth"
import { handleGetUserBalance } from "./handlers/getUserBalance"
import { handleGetOrder } from "./handlers/getOrders"
import { handleGetPosition } from "./handlers/getPosition"
import { handleGetUserPosition } from "./handlers/getuserPosition"
import { handleOnRamp } from "./handlers/onRamp"
import { handleGetOrders } from "./handlers/getOpenOrders"
import { handleGetFills } from "./handlers/getFills"
import { handlePriceUpdate } from "./handlers/priceUpdate"

import { client, connectionRedis } from "@repo/redis"

export function handleEngineRequest(message: EngineRequest) {
    switch (message.type) {
        case "onRamp" :
            return handleOnRamp (message.payload) // done
        case "create-order":
            return handleCreateOrder(message.payload) // done
        case "cancel-order":
            return handleCancelOrder(message.payload) // done
        case "get-depth":
            return handleGetDepth(message.payload)
        case "get-user-balance":
            return handleGetUserBalance(message.payload) //done
        case "get-open-orders":
            return handleGetOrders(message.payload) // done
        case "get-orders":
            return handleGetOrder(message.payload)
        case "get-position":
            return handleGetPosition(message.payload) //done
        case "get-user-position":
            return handleGetUserPosition(message.payload) //done
        case "get-fills":
            return handleGetFills(message.payload) 
        case "price-update":
            return handlePriceUpdate(message.payload) 
        default:
            throw new Error(`Unknown command type`)
    }
}

function parsePayload(requestType: string, payload: Record<string, string>): Record<string, any> {
    const result: Record<string, any> = { ...payload };
    
    if (requestType === "onRamp") {
        if (payload.amount !== undefined) {
            result.amount = parseFloat(payload.amount);
        }
    } else if (requestType === "create-order") {
        if (payload.qty !== undefined) {
            result.qty = parseFloat(payload.qty);
        }
        if (payload.margin !== undefined) {
            result.margin = parseFloat(payload.margin);
        }
        if (payload.sllipage !== undefined) {
            result.sllipage = parseFloat(payload.sllipage);
        }
        if (payload.price !== undefined) {
            result.price = payload.price && payload.price !== "" ? parseFloat(payload.price) : null;
        }
    } else if (requestType === "get-depth") {
        if (payload.limit !== undefined) {
            result.limit = parseInt(payload.limit, 10);
        }
    } else if (requestType === "price-update") {
        if (payload.price !== undefined) {
            result.price = parseFloat(payload.price);
        }
    }
    
    return result;
}

async function startEngine() {
    await connectionRedis();
    await connectWriteClient();
    
    const streamKey = "engine:request";
    let lastId = "$"; // start reading new messages

    console.log(`Engine worker started, listening on ${streamKey}...`);

    while (true) {
        try {
            const streams = await client.xRead(
                [{ key: streamKey, id: lastId }],
                {
                    BLOCK: 1000,
                    COUNT: 10
                }
            );

            if (!streams) continue;

            for (const stream of streams) {
                for (const message of stream.messages) {
                    lastId = message.id;
                    const { correlationId, responseTo, requestType, ...payload } = message.message;

                    if (!correlationId || !requestType) {
                        console.error("Invalid engine request message format:", message.message);
                        continue;
                    }

                    if (requestType !== "price-update" && !responseTo) {
                        console.error("Missing responseTo for requestType:", requestType);
                        continue;
                    }

                    console.log(`[Engine] Processing request ${correlationId} (${requestType})`);

                    try {
                        const typedPayload = parsePayload(requestType, payload as Record<string, string>);

                        const result = handleEngineRequest({
                            correlationId,
                            type: requestType as any,
                            payload: typedPayload
                        });

                        if (requestType !== "price-update") {
                            await writeClient.xAdd(
                                responseTo,
                                "*",
                                {
                                    correlationId,
                                    data: JSON.stringify(result)
                                }
                            );
                            await writeClient.expire(responseTo, 60);
                        }

                        if (requestType === "create-order" || requestType === "cancel-order") {
                            const symbol = payload.symbol as string | undefined;
                            if (symbol) {
                                try {
                                    const depthSnapshot = handleGetDepth({ symbol, limit: 30 });
                                    await writeClient.publish(`pubsub:orderbook:${symbol}`, JSON.stringify(depthSnapshot));
                                } catch (depthErr) {
                                    // Ignore error if orderbook is not initialized yet
                                }
                            }
                        }

                    } catch (err: any) {
                        console.error(`[Engine] Error processing request ${correlationId}:`, err);
                        if (requestType !== "price-update" && responseTo) {
                            await writeClient.xAdd(
                                responseTo,
                                "*",
                                {
                                    correlationId,
                                    error: JSON.stringify({ message: err.message || "Unknown error" })
                                }
                            );
                            await writeClient.expire(responseTo, 60);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error in engine consumer loop:", error);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

startEngine().catch(console.error);
