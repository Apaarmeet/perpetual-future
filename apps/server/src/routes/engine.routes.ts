import { onRampSchema } from "@/validators/engine.validator";
import { Router} from "express";
import {client, connectionRedis} from "@repo/redis"
import { randomUUIDv7 } from "bun";


await connectionRedis()
export const engineRouter:Router = Router()

const correlationId = randomUUIDv7

engineRouter.post("/onramp",(req, res) => {
    const body = req.body
    const user =  req.user

    const verify = onRampSchema.safeParse(body)
    if(!verify.success){
        return res.status(401).json({
            error:"Invalid Inputs"
        })
    }
    const data = verify.data
    const payloadToSent = {
        userId: user.id,
        symbol: data.symbol,
        amount: data.amount
    }


    
    const engineRequest = new Promise(async(resolve,reject)=>{
         
         await client.xAdd()

    })


    

})


engineRouter.post("/order", (req, res) => {})
engineRouter.delete("/order", (req, res) => {})
engineRouter.get("/equity/available", (req, res) => {})
engineRouter.get("/positions/open/:marketId", (req, res) => {});
engineRouter.get("/positions/closed/:marketId", (req, res) => {});
engineRouter.get("/orders/open/:marketId", (req, res) => {})
engineRouter.get("/orders/:marketId", (req, res) => {})
engineRouter.get("/fills", (req, res) => {});