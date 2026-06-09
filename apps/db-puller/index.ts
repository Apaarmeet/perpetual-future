import prisma from "@perps-turbo-repo/db";
import { client, connectionRedis } from "@repo/redis";

async function startDbPuller() {
    await connectionRedis();
    console.log("[DB Puller] Connected to Redis and PostgreSQL Database.");

    const streamKey = "db:events";
    let lastId = "0"; // Start from the beginning to catch up on any missed events

    while (true) {
        try {
            const streams = await client.xRead(
                [{ key: streamKey, id: lastId }],
                {
                    BLOCK: 2000,
                    COUNT: 50
                }
            );

           if(!streams) continue

            for (const stream of streams) {
                for (const message of stream.messages) {
                    lastId = message.id;
                    const { type, data } = message.message;

                    if (!type || !data) {
                        console.warn("[DB Puller] Invalid message skipped:", message.message);
                        continue;
                    }

                    try {
                        const parsedData = JSON.parse(data);

                        if (type === "trade-event") {
                            const { orders, fills } = parsedData;

                            console.log(`[DB Puller] Processing trade-event: ${orders?.length || 0} orders, ${fills?.length || 0} fills.`);

                            const tradeTicks: {
                                fillId: string;
                                symbol: string;
                                price: number;
                                qty: number;
                                createdAt: number;
                            }[] = [];

                            const candlePubs: {
                                symbol: string;
                                timestamp: number;
                                open: number;
                                high: number;
                                low: number;
                                close: number;
                                volume: number;
                            }[] = [];

                            // 1. Process orders sequentially using transaction
                            await prisma.$transaction(async (tx) => {
                                for (const order of orders) {
                                    await tx.order.upsert({
                                        where: { orderId: order.orderId },
                                        update: {
                                            filledQty: order.filledQty,
                                            Status: order.status
                                        },
                                        create: {
                                            orderId: order.orderId,
                                            userId: order.userId,
                                            side: order.side.toUpperCase() === "BUY" ? "buy" : "sell",
                                            type: order.type.toLowerCase() === "limit" ? "limit" : "market",
                                            price: order.price !== null && order.price !== undefined ? order.price.toString() : null,
                                            qty: order.qty.toString(),
                                            filledQty: order.filledQty.toString(),
                                            margin: order.margin.toString(),
                                            Status: order.status,
                                            createdAt: new Date(order.createdAt)
                                        }
                                    });
                                }

                                const candleUpdates = new Map<string, {
                                    symbol: string;
                                    timestamp: Date;
                                    open: number;
                                    high: number;
                                    low: number;
                                    close: number;
                                    volume: number;
                                }>();

                                // 2. Process fills
                                for (const fill of fills) {
                                    await tx.fill.upsert({
                                        where: { fillId: fill.fillId },
                                        update: {},
                                        create: {
                                            fillId: fill.fillId,
                                            symbol: fill.symbol,
                                            price: fill.price.toString(),
                                            qty: fill.qty.toString(),
                                            buyOrderId: fill.buyOrderId,
                                            sellOrderId: fill.sellOrderId,
                                            createdAt: new Date(fill.createdAt)
                                        }
                                    });

                                    const fillPrice = parseFloat(fill.price.toString());
                                    const fillQty = parseFloat(fill.qty.toString());
                                    const fillTime = new Date(fill.createdAt);
                                    const bucketTime = new Date(Math.floor(fillTime.getTime() / 60000) * 60000);
                                    const key = `${fill.symbol}-${bucketTime.getTime()}`;

                                    tradeTicks.push({
                                        fillId: fill.fillId,
                                        symbol: fill.symbol,
                                        price: fillPrice,
                                        qty: fillQty,
                                        createdAt: fillTime.getTime()
                                    });

                                    const existing = candleUpdates.get(key);
                                    if (existing) {
                                        existing.close = fillPrice;
                                        existing.high = Math.max(existing.high, fillPrice);
                                        existing.low = Math.min(existing.low, fillPrice);
                                        existing.volume += fillQty;
                                    } else {
                                        candleUpdates.set(key, {
                                            symbol: fill.symbol,
                                            timestamp: bucketTime,
                                            open: fillPrice,
                                            high: fillPrice,
                                            low: fillPrice,
                                            close: fillPrice,
                                            volume: fillQty
                                        });
                                    }
                                }

                                // 3. Aggregate into candles
                                for (const update of candleUpdates.values()) {
                                    const dbCandle = await tx.candle.findUnique({
                                        where: {
                                            symbol_interval_timestamp: {
                                                symbol: update.symbol,
                                                interval: "1m",
                                                timestamp: update.timestamp
                                            }
                                        }
                                    });

                                    let finalCandle;
                                    if (!dbCandle) {
                                        finalCandle = await tx.candle.create({
                                            data: {
                                                symbol: update.symbol,
                                                interval: "1m",
                                                timestamp: update.timestamp,
                                                open: update.open,
                                                high: update.high,
                                                low: update.low,
                                                close: update.close,
                                                volume: update.volume
                                            }
                                        });
                                    } else {
                                        finalCandle = await tx.candle.update({
                                            where: { id: dbCandle.id },
                                            data: {
                                                close: update.close,
                                                high: Math.max(parseFloat(dbCandle.high.toString()), update.high),
                                                low: Math.min(parseFloat(dbCandle.low.toString()), update.low),
                                                volume: parseFloat(dbCandle.volume.toString()) + update.volume
                                            }
                                        });
                                    }

                                    candlePubs.push({
                                        symbol: update.symbol,
                                        timestamp: update.timestamp.getTime(),
                                        open: parseFloat(finalCandle.open.toString()),
                                        high: parseFloat(finalCandle.high.toString()),
                                        low: parseFloat(finalCandle.low.toString()),
                                        close: parseFloat(finalCandle.close.toString()),
                                        volume: parseFloat(finalCandle.volume.toString())
                                    });
                                }
                            });

                            // Publish events after transaction successfully committed
                            for (const tick of tradeTicks) {
                                await client.publish(`pubsub:trade:${tick.symbol}`, JSON.stringify(tick));
                                await client.publish(`pubsub:ticker:${tick.symbol}`, JSON.stringify({
                                    symbol: tick.symbol,
                                    price: tick.price,
                                    timestamp: tick.createdAt
                                }));
                            }

                            for (const candlePub of candlePubs) {
                                await client.publish(`pubsub:candle:${candlePub.symbol}`, JSON.stringify(candlePub));
                            }

                        } else if (type === "order-update") {
                            const order = parsedData;
                            console.log(`[DB Puller] Processing order-update: ${order.orderId} (Status: ${order.status}).`);

                            await prisma.order.upsert({
                                where: { orderId: order.orderId },
                                update: {
                                    filledQty: order.filledQty,
                                    Status: order.status
                                },
                                create: {
                                    orderId: order.orderId,
                                    userId: order.userId,
                                    side: order.side.toUpperCase() === "BUY" ? "buy" : "sell",
                                    type: order.type.toLowerCase() === "limit" ? "limit" : "market",
                                    price: order.price !== null && order.price !== undefined ? order.price.toString() : null,
                                    qty: order.qty.toString(),
                                    filledQty: order.filledQty.toString(),
                                    margin: order.margin.toString(),
                                    Status: order.status,
                                    createdAt: new Date(order.createdAt)
                                }
                            });
                        }
                    } catch (err: any) {
                        console.error("[DB Puller] Error processing event details:", err);
                    }
                }
            }
        } catch (error) {
            console.error("[DB Puller] Error in consumer loop:", error);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

startDbPuller().catch(console.error);
