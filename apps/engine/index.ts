import type { EngineRequest } from "./exchangeStore"
import { handleCreateOrder } from "./handlers/createOrder"
import { handleCancelOrder } from "./handlers/cancelOrder"

function handleEngineRequest(message: EngineRequest) {
    switch (message.type) {
        case "create-order":
            return handleCreateOrder(message.payload)
        case "cancel-order":
            return handleCancelOrder(message.payload)
        case "get-depth":
            throw new Error("get-depth not implemented")
        case "get-user-balance":
            throw new Error("get-user-balance not implemented")
        case "get-order":
            throw new Error("get-order not implemented")
        case "get-position":
            throw new Error("get-position not implemented")
        case "get-user-position":
            throw new Error("get-user-position not implemented")
        default:
            throw new Error(`Unknown command type`)
    }
}
