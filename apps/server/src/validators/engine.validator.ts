import z from "zod"


export const createOrderSchema = z.object({
    userId : z.string(),
    type: z.enum(["market","limit"]),
    side: z.enum(["buy","sell"]),
    symbol: z.string(),
    price: z.number().positive().optional().nullable(),
    qty: z.number().positive(),
    margin: z.number().positive(),
    sllipage: z.number().positive()
})

export const cancelOrderSchema = z.object({
    userId:z.string(),
    orderId:z.string(),
})

export const getDepthSchema = z.object({
    symbol:z.string(),
    limit: z.coerce.number().int().positive().max(100).default(20),
})

export const onRampSchema = z.object({
    userId: z.string(),
    symbol: z.string(),
    amount: z.number().positive(),
})