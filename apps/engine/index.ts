import type { EngineRequest } from "./exchangeStore"
import { handleCreateOrder } from "./handlers/createOrder"
import { handleCancelOrder } from "./handlers/cancelOrder"
import {  handleGetDepth } from "./handlers/getDepth"
import { handleGetUserBalance } from "./handlers/getUserBalance"
import { handleGetOrder } from "./handlers/getOrder"
import { handleGetPosition } from "./handlers/getPosition"
import { handleGetUserPosition } from "./handlers/getuserPosition"

function handleEngineRequest(message: EngineRequest) {
    switch (message.type) {
        case "create-order":
            return handleCreateOrder(message.payload)
        case "cancel-order":
            return handleCancelOrder(message.payload)
        case "get-depth":
            return handleGetDepth(message.payload)
        case "get-user-balance":
            return handleGetUserBalance(message.payload)
        case "get-order":
            return handleGetOrder(message.payload)
        case "get-position":
            return handleGetPosition(message.payload)
        case "get-user-position":
            return handleGetUserPosition(message.payload)
        default:
            throw new Error(`Unknown command type`)
    }
}
