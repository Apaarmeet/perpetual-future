import { cancelOrderSchema, createOrderSchema, onRampSchema } from "@/validators/engine.validator";
import { Router} from "express";
import {client, connectionRedis} from "@repo/redis"




await connectionRedis()
export const engineRouter:Router = Router()
const pendingRequest = new Map<string,(value:unknown)=> void>()
const backendId = crypto.randomUUID();

startResponseWorker().catch(console.error)  





async function startResponseWorker(){
    while(true){
        const response  = await client.xRead([
            {
                key: `response:${backendId}`,
                id: "$"
            }
        ],
        {
            BLOCK:0
        }
    )

    if(!response) continue;
    
    for(const stream of response){
        for(const message of stream.messages){
            const correlationId = message.message.correlationId
            const resolver = pendingRequest.get(
                correlationId
            );

            if(!resolver) continue;

            resolver(message.message);
            pendingRequest.delete(correlationId)


        }
    }

    }
}


engineRouter.post("/onramp",async (req, res) => {
    const body = req.body
    const user =  req.user

    const verify = onRampSchema.safeParse(body)
    if(!verify.success){
        return res.status(401).json({
            error:"Invalid Inputs"
        })
    }
    const data = verify.data
    const correlationId = crypto.randomUUID()

    

    
    const engineRequest = new Promise((resolve)=>{ 
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
           requestType:"onRamp",
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
    if(!verify.success){
        return res.status(401).json({
            error:"Invalid Input"
        })
    }
    const data = verify.data;
    const correlationId = crypto.randomUUID()

    const engineRequest = new Promise((resolve)=>{
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
            price: data.price!.toString(),
                }
    )

    const response = await engineRequest

    return res.json({
        response
    })


})
engineRouter.delete("/order", async (req, res) => {
   const body =  req.body;
   const user = req.user;

   const verify = cancelOrderSchema.safeParse(body)
   if(!verify.success){
    return res.status(401).json({
        error:"Invalid Input"
    })
   }
   const data = verify.data;
   const correlationId = crypto.randomUUID()

   const engineRequest = new Promise((resolve)=>{
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

   const engineRequest = new Promise((resolve)=>{
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
        responseTo:`response:${backendId}`,
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
engineRouter.get("/position", async (req,res)=>{
    const user = req.user;
    const correlationId = crypto.randomUUID()

    const engineRequest = new Promise ((resolve)=>{
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
            responseTo:`response:${backendId}`,
            requestType: "get-user-position",
            userId:user.id
        }
    )

    const response = await engineRequest

    return res.json({
        response
    })
})
engineRouter.get("/positions/closed/:marketId", (req, res) => {});
engineRouter.get("/orders/open/:marketId", (req, res) => {})
engineRouter.get("/orders/:marketId", (req, res) => {})
engineRouter.get("/fills", (req, res) => {});