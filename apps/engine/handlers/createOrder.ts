import {
    BALANCES, FILLS, ORDERBOOKS, ORDERS, POSITIONS,
    type CreateOrderInput, type Fill, type OrderRecord, type RestingOrder
} from "../exchangeStore"

export function handleCreateOrder(payload: Record<string, unknown>) {
    const { userId, type, side, symbol, price, qty, margin } = payload as unknown as CreateOrderInput

    let orderbook = ORDERBOOKS.get(symbol)
    if (!orderbook) {
        orderbook = {
            asks: new Map<number, RestingOrder[]>(),
            bids: new Map<number, RestingOrder[]>()
        }
        ORDERBOOKS.set(symbol, orderbook)
    }

    const orderId = crypto.randomUUID()
    const createdAt = Date.now()

    if (type === "market") {
        if (side === "buy") {
            const sortedAskPrices = [...orderbook.asks.keys()].sort((a, b) => a - b)

            if (sortedAskPrices.length === 0) {
                throw new Error("No liquidity Available")
            }

            let userUSDBalance = BALANCES.get(userId)!.USD
            if (userUSDBalance!.available < margin) throw new Error("Available balance is low")

            userUSDBalance!.locked += margin
            userUSDBalance!.available -= margin

            const bestAsk = sortedAskPrices[0]
            const maxPrice = bestAsk! * 1.05

            let remainingQty = qty
            let qty_filled_Sofar = 0
            let fills: Fill[] = []
            let filledNotional = 0
            let averagePrice = 0
            let totalMarginUsed = 0

            for (const bestPrice of sortedAskPrices) {
                if (remainingQty <= 0) break
                if (bestPrice > maxPrice) break

                const bestOrders = orderbook.asks.get(bestPrice)
                if (!bestOrders) continue

                for (const restingOrder of bestOrders) {
                    if (remainingQty <= 0) break
                    const restRemainingQty = restingOrder.qty - restingOrder.filledQty
                    if (restRemainingQty <= 0) continue

                    const minQtyCanBeFilled = Math.min(restRemainingQty, remainingQty)

                    qty_filled_Sofar += minQtyCanBeFilled
                    remainingQty -= minQtyCanBeFilled
                    restingOrder.filledQty += minQtyCanBeFilled

                    const marginUsed = margin * (minQtyCanBeFilled / qty)
                    totalMarginUsed += marginUsed
                    BALANCES.get(userId)!.USD!.locked -= marginUsed

                    if (restingOrder.filledQty === restingOrder.qty) {
                        restingOrder.status = "filled"
                    } else {
                        restingOrder.status = "partially_filled"
                    }

                    const fill: Fill = {
                        fillId: crypto.randomUUID(),
                        symbol,
                        price: bestPrice,
                        qty: minQtyCanBeFilled,
                        buyOrderId: orderId,
                        sellOrderId: restingOrder.orderId,
                        createdAt
                    }

                    fills.push(fill)
                    FILLS.push(fill)
                    filledNotional += bestPrice * minQtyCanBeFilled
                    averagePrice = filledNotional / qty_filled_Sofar
                }

                const remainingAtLevel = bestOrders.filter(o => o.status !== "filled")
                if (remainingAtLevel.length > 0) {
                    orderbook.asks.set(bestPrice, remainingAtLevel)
                } else {
                    orderbook.asks.delete(bestPrice)
                }
            }

            const filledQty = qty_filled_Sofar

            if (remainingQty > 0) {
                userUSDBalance!.available += userUSDBalance!.locked
                userUSDBalance!.locked = 0
            }

            const orderRecord: OrderRecord = {
                createdAt,
                filledQty: qty_filled_Sofar,
                fills,
                orderId,
                price: averagePrice,
                qty,
                side,
                status: filledQty === qty ? "filled" : "partially_filled",
                symbol,
                type,
                userId
            }

            ORDERS.set(orderId, orderRecord)

            if (filledQty > 0) {
                const leverage = filledNotional / totalMarginUsed
                const liquidationPrice = averagePrice * (1 - 1 / leverage)

                if (!POSITIONS.has(userId)) POSITIONS.set(userId, {})
                const userPositions = POSITIONS.get(userId)!
                const existing = userPositions[symbol]

                if (!existing) {
                    userPositions[symbol] = {
                        userId,
                        market: symbol,
                        side: "long",
                        qty: qty_filled_Sofar,
                        averagePrice,
                        margin: totalMarginUsed,
                        leverage,
                        liquidationPrice,
                        realisedPnL: 0,
                        updatedAt: createdAt
                    }
                } else if (existing.side === "long") {
                    const totalQty = existing.qty + filledQty
                    const newAvg = (existing.averagePrice * existing.qty + averagePrice * filledQty) / totalQty
                    existing.averagePrice = newAvg
                    existing.qty = totalQty
                    existing.margin += totalMarginUsed
                    existing.leverage = (existing.qty * existing.averagePrice) / existing.margin
                    existing.liquidationPrice = existing.averagePrice * (1 - 1 / existing.leverage)
                    existing.updatedAt = createdAt
                }
            }

            return { orderId, orderRecord, fills }
        }
    }

    if(type === "market") {
        if(side === "sell"){
            
        }
    }
}
