import { cancelOrderSchema, createOrderSchema, onRampSchema } from "@/validators/engine.validator";
import { Router } from "express";
import { client, connectionRedis } from "@repo/redis"
import prisma from "@perps-turbo-repo/db";




await connectionRedis()
const blockingClient = client.duplicate()
await blockingClient.connect()

export const engineRouter: Router = Router()
const pendingRequest = new Map<string, (value: unknown) => void>()
const backendId = crypto.randomUUID();

startResponseWorker().catch(console.error)





async function startResponseWorker() {
    let lastId = "$";
    while (true) {
        try {
            const response = await blockingClient.xRead([
                {
                    key: `response:${backendId}`,
                    id: lastId
                }
            ],
                {
                    BLOCK: 0
                }
            )

            if (!response) continue;

            for (const stream of response) {
                for (const message of stream.messages) {
                    lastId = message.id;
                    const correlationId = message.message.correlationId
                    const resolver = pendingRequest.get(
                        correlationId
                    );

                    if (!resolver) continue;

                    let responseData: any = message.message;
                    if (message.message.data) {
                        try {
                            responseData = JSON.parse(message.message.data);
                        } catch (e) {
                            // fallback
                        }
                    } else if (message.message.error) {
                        try {
                            responseData = { error: JSON.parse(message.message.error) };
                        } catch (e) {
                            responseData = { error: message.message.error };
                        }
                    }

                    resolver(responseData);
                    pendingRequest.delete(correlationId)
                }
            }
        } catch (error) {
            console.error("Error in server response worker:", error);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}


engineRouter.post("/onramp", async (req, res) => {
    const body = req.body
    const user = req.user

    const verify = onRampSchema.safeParse(body)
    if (!verify.success) {
        return res.status(401).json({
            error: "Invalid Inputs"
        })
    }
    const data = verify.data
    const correlationId = crypto.randomUUID()




    const engineRequest = new Promise((resolve) => {
        pendingRequest.set(
            correlationId,
            resolve
        )
    })

    // engineRequest = {correlationId: "", }

    await client.xAdd(
        "engine:request",
        "*",
        {
            correlationId,
            responseTo: `response:${backendId}`,
            requestType: "onRamp",
            userId: user.id,
            symbol: "USD",
            amount: data.amount.toString()
        }
    )

    const response = await engineRequest

    return res.json({
        response
    })

})


engineRouter.post("/order", async (req, res) => {
    const body = req.body
    const user = req.user;

    const verify = createOrderSchema.safeParse(body)
    if (!verify.success) {
        return res.status(401).json({
            error: "Invalid Input"
        })
    }
    const data = verify.data;
    const correlationId = crypto.randomUUID()

    const engineRequest = new Promise((resolve) => {
        pendingRequest.set(
            correlationId,
            resolve
        )
    })

    await client.xAdd(
        "engine:request",
        "*",
        {
            correlationId,
            responseTo: `response:${backendId}`,
            requestType: "create-order",
            userId: user.id,
            type: data.type,
            side: data.side,
            symbol: data.symbol,
            qty: data.qty.toString(),
            margin: data.margin.toString(),
            sllipage: data.sllipage.toString(),
            price: data.price !== undefined && data.price !== null ? data.price.toString() : "",
        }
    )

    const response = await engineRequest

    return res.json({
        response
    })


})
engineRouter.delete("/order", async (req, res) => {
    const body = req.body;
    const user = req.user;

    const verify = cancelOrderSchema.safeParse(body)
    if (!verify.success) {
        return res.status(401).json({
            error: "Invalid Input"
        })
    }
    const data = verify.data;
    const correlationId = crypto.randomUUID()

    const engineRequest = new Promise((resolve) => {
        pendingRequest.set(
            correlationId,
            resolve
        )
    })

    await client.xAdd(
        "engine:request",
        "*",
        {
            correlationId,
            responseTo: `response:${backendId}`,
            requestType: "cancel-order",
            userId: user.id,
            orderId: data.orderId,
        }
    )

    const response = await engineRequest

    return res.json({
        response
    })
})
engineRouter.get("/equity/available", async (req, res) => {
    const user = req.user;
    const correlationId = crypto.randomUUID();

    const engineRequest = new Promise((resolve) => {
        pendingRequest.set(correlationId, resolve);
    });

    await client.xAdd("engine:request", "*", {
        correlationId,
        responseTo: `response:${backendId}`,
        requestType: "get-user-balance",
        userId: user.id,
    });

    const response = await engineRequest;
    return res.json({ response });
})
engineRouter.get("/positions/open/:marketId", async (req, res) => {
    const symbol = req.params.marketId;
    const user = req.user;

    const correlationId = crypto.randomUUID();

    const engineRequest = new Promise((resolve) => {
        pendingRequest.set(
            correlationId,
            resolve
        )
    })

    await client.xAdd(
        "engine:request",
        "*",
        {
            correlationId,
            responseTo: `response:${backendId}`,
            requestType: "get-position",
            userId: user.id,
            symbol: symbol
        }
    )

    const response = await engineRequest

    return res.json({
        response
    })

});
engineRouter.get("/position", async (req, res) => {
    const user = req.user;
    const correlationId = crypto.randomUUID()

    const engineRequest = new Promise((resolve) => {
        pendingRequest.set(
            correlationId,
            resolve
        )
    })

    await client.xAdd(
        "engine:request",
        "*",
        {
            correlationId,
            responseTo: `response:${backendId}`,
            requestType: "get-user-position",
            userId: user.id
        }
    )

    const response = await engineRequest

    return res.json({
        response
    })
})
engineRouter.get("/positions/closed/:marketId", (_req, _res) => { });
engineRouter.get("/orders/open/:marketId", async (req, res) => {
    const user = req.user
    const symbol = req.params.marketId
    const status = "open"
    const correlationId = crypto.randomUUID();

    const engineRequest = new Promise((resolve) => {
        pendingRequest.set(
            correlationId,
            resolve
        )
    })
    await client.xAdd(
        "engine:request",
        "*",
        {
            correlationId,
            responseTo: `response:${backendId}`,
            requestType: "get-open-orders",
            userId: user.id,
            symbol,
            status
        }
    )

    const response = await engineRequest

    return res.json({
        response
    })
})
engineRouter.get("/orders/:marketId", async (req, res) => {
    const user = req.user
    const symbol = req.params.marketId
    const correlationId = crypto.randomUUID();

    const engineRequest = new Promise((resolve) => {
        pendingRequest.set(
            correlationId,
            resolve
        )
    })
    await client.xAdd(
        "engine:request",
        "*",
        {
            correlationId,
            responseTo: `response:${backendId}`,
            requestType: "get-orders",
            userId: user.id,
            symbol,
        }
    )

    const response = await engineRequest

    return res.json({
        response
    })
})
engineRouter.get("/fills", async (req, res) => {
    const user = req.user;
    const symbol = req.query.symbol as string | undefined;
    const correlationId = crypto.randomUUID();

    const engineRequest = new Promise((resolve) => {
        pendingRequest.set(
            correlationId,
            resolve
        );
    });

    const fields: Record<string, string> = {
        correlationId,
        responseTo: `response:${backendId}`,
        requestType: "get-fills",
        userId: user.id
    };

    if (symbol) {
        fields.symbol = symbol;
    }

    await client.xAdd(
        "engine:request",
        "*",
        fields
    );

    const response = await engineRequest;

    return res.json({
        response
    });
});

engineRouter.get("/candles", async (req, res) => {
    const symbol = req.query.symbol as string;
    const interval = (req.query.interval as string) || "1m";
    const limitStr = req.query.limit as string | undefined;
    const limit = limitStr ? parseInt(limitStr, 10) : 100;

    if (!symbol) {
        return res.status(400).json({ error: "Missing symbol query parameter" });
    }

    try {
        const candles = await prisma.candle.findMany({
            where: {
                symbol,
                interval
            },
            orderBy: {
                timestamp: "asc"
            },
            take: limit
        });

        return res.json({
            candles: candles.map(c => ({
                time: c.timestamp.getTime(),
                open: parseFloat(c.open.toString()),
                high: parseFloat(c.high.toString()),
                low: parseFloat(c.low.toString()),
                close: parseFloat(c.close.toString()),
                volume: parseFloat(c.volume.toString())
            }))
        });
    } catch (err: any) {
        console.error("Failed to query candles:", err);
        return res.status(500).json({ error: "Database error" });
    }
});