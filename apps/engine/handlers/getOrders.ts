import { ORDERS, type getOrderInput } from "../exchangeStore";

export function handleGetOrder(payload: Record<string, unknown>) {
    const { userId, orderId, symbol } = payload as { userId: string; orderId?: string; symbol?: string }

    if (orderId) {
        const order = ORDERS.get(orderId)
        if (order && order.userId === userId) {
            return { order }
        }
        return { order: undefined }
    }

    const orders = [...ORDERS.values()].filter((order) => {
        if (order.userId !== userId) return false
        if (symbol && order.symbol !== symbol) return false

        return true
    })

    return { orders }
}