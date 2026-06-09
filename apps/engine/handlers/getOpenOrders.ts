import { ORDERS } from "../exchangeStore"

export function handleGetOrders(payload: Record<string, unknown>) {
  const { userId, symbol, status } = payload as { userId: string; symbol: string; status?: string }

  const orders = [...ORDERS.values()].filter((order) => {
    if (order.userId !== userId) return false
    if (order.symbol !== symbol) return false
    if (status && order.status !== status) return false
    return true
  })

  return { orders }
}
