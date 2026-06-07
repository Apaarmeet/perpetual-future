import {createClient} from "redis"
import { env } from "@perps-turbo-repo/env/server";

export const client = createClient({
    url: env.REDIS_URL
})

client.on("error", (err)=>{
    console.error("Redis Error", err)
})

export async function connectionRedis(){
    if(!client.isOpen){
        await client.connect();
    }
}