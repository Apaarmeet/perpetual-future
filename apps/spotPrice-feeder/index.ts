import WebSocket from "ws"
import { client, connectionRedis } from "@repo/redis"

// Connect to Redis before opening the WS connection
await connectionRedis();
console.log("Spot price feeder connected to Redis.");

const ws = new WebSocket("wss://stream.binance.com:9443/ws/solusdt@ticker")

ws.on('error', console.error);

ws.on('message', async (data: any) => {
    try {
        const msg = data.toString('utf8')
        const ticker = JSON.parse(msg)
        const price = ticker.c // Close price of the ticker
        if (!price) return;

        console.log(`[Feeder] Spot Price SOL: ${price}`);

        // Push price update to engine request stream
        await client.xAdd(
            "engine:request",
            "*",
            {
                correlationId: crypto.randomUUID(),
                requestType: "price-update",
                symbol: "SOL_USD_PERP",
                price: price.toString()
            }
        );
    } catch (err) {
        console.error("Error processing message or pushing to Redis:", err);
    }
})

