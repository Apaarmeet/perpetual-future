import { ORDERS, type getOrderInput } from "../exchangeStore";

export function handleGetOrder(payload : Record<string,unknown>){
    const {userId, orderId} = payload as unknown as getOrderInput

    const order = ORDERS.get(orderId)

    if(order?.userId !== userId) throw new Error("Unauthorised")
    
        return {
            userId,
            order
        }
}