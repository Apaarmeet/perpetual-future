import {
  BALANCES, ORDERBOOKS, ORDERS,
  type OrderRecord
} from "../exchangeStore"

export function handleCancelOrder(payload: Record<string, unknown>) {
  const { userId, orderId } = payload as { userId: string; orderId: string }

  const order = ORDERS.get(orderId)
  if (!order) throw new Error("Order not found")
  if (order.userId !== userId) throw new Error("Unauthorized")
  if (order.status === "filled" || order.status === "cancelled") throw new Error("Order already filled or cancelled")

  const orderbook = ORDERBOOKS.get(order.symbol)
  if (orderbook && order.type === "limit") {
    const level = order.side === "buy" ? orderbook.bids : orderbook.asks
    const ordersAtLevel = level.get(order.price!)
    if (ordersAtLevel) {
      const remaining = ordersAtLevel.filter((o) => o.orderId !== orderId)
      if (remaining.length > 0) {
        level.set(order.price!, remaining)
      } else {
        level.delete(order.price!)
      }
    }
  }

  const userBalance = BALANCES.get(userId)
  if (userBalance) {
    const balance = userBalance["USD"]
    if (balance) {
      const remainingQty = order.qty - order.filledQty
      const marginToRelease = order.margin * (remainingQty / order.qty)
      balance.locked -= marginToRelease
      balance.available += marginToRelease
    }
  }

  order.status = "cancelled"

  return order
}
