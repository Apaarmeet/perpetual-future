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

            let qtyToBeOpen = qty
            let qtyToBeClose = 0
            let userPositions = POSITIONS.get(userId)
            if(userPositions){ 
                let userPositions_of_asset  = userPositions[symbol]
                if(userPositions_of_asset?.side === "short"){
                    //reduce only order
                    qtyToBeClose = Math.min(qty,userPositions_of_asset.qty)
                    qtyToBeOpen -= qtyToBeClose;
                }
        }
            const sortedAskPrices = [...orderbook.asks.keys()].sort((a, b) => a - b)

            if (sortedAskPrices.length === 0) {
                throw new Error("No liquidity Available")
            }

            let userUSDBalance = BALANCES.get(userId)!.USD
            
            let marginNeeded = margin * (qtyToBeOpen/qty)

            if(qtyToBeOpen>0){
                userUSDBalance!.locked += marginNeeded
                userUSDBalance!.available -= marginNeeded
            }   

            
            

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

                    const marginUsed = marginNeeded * (minQtyCanBeFilled / qty)
                    totalMarginUsed += marginUsed

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

            if (remainingQty > 0) {
                const refundMargin = marginNeeded - totalMarginUsed
                userUSDBalance!.available += refundMargin
                userUSDBalance!.locked -= refundMargin
            }

            const filledQty = qty_filled_Sofar
            const actualClosedQty = Math.min(qtyToBeClose, filledQty);
            const remainingOpenQty = filledQty - actualClosedQty;

            if(userPositions){
                let userPositions_of_asset= userPositions[symbol]
                if(userPositions_of_asset?.side === "short"){
                    let realisedPnl = (userPositions_of_asset.averagePrice - averagePrice) * actualClosedQty
                    const marginToRelease = userPositions_of_asset.margin * (actualClosedQty / userPositions_of_asset.qty)
                    userUSDBalance!.available += marginToRelease + realisedPnl
                    userPositions_of_asset.realisedPnL += realisedPnl
                    userPositions_of_asset.updatedAt = createdAt
                    userPositions_of_asset.qty -= actualClosedQty
                    userPositions_of_asset.margin -= marginToRelease
                    if (userPositions_of_asset.qty === 0) {
                         delete userPositions[symbol];
                        }
                }
                    
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

            if (remainingOpenQty > 0) {
                const openQtyNotional = filledNotional * (remainingOpenQty / filledQty)
                const leverage = openQtyNotional / totalMarginUsed
                const liquidationPrice = averagePrice * (1 - 1 / leverage)


                if (!POSITIONS.has(userId)) POSITIONS.set(userId, {})
                const userPositions = POSITIONS.get(userId)!
                const existing = userPositions[symbol]

                if (!existing) {
                    userPositions[symbol] = {
                        userId,
                        market: symbol,
                        side: "long",
                        qty: remainingOpenQty,
                        averagePrice,
                        margin: totalMarginUsed,
                        leverage,
                        liquidationPrice,
                        realisedPnL: 0,
                        updatedAt: createdAt
                    }
                } else if (existing.side === "long") {
                    const totalQty = existing.qty + remainingOpenQty
                    const newAvg = (existing.averagePrice * existing.qty + averagePrice * remainingOpenQty) / totalQty
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
            let qtyToBeOpen = qty;
            let qtyToBeClose = 0;
            const userPositions = POSITIONS.get(userId);
            if(userPositions){
                let userPositions_of_asset = userPositions[symbol]
                if(userPositions_of_asset?.side === "long"){
                    //reduce only order
                    qtyToBeClose = Math.min(qty, userPositions_of_asset.qty)
                    qtyToBeOpen -= qtyToBeClose
                }
            }

            const sortedBidsPrices = [...orderbook.bids.keys()].sort((a,b)=>b-a)
            const bestBid = sortedBidsPrices[0];
            //sllipage calculation
            const maxPrice = bestBid! * 1.05


            

            const userBalance = BALANCES.get(userId)
            if(!userBalance) throw new Error("No entry of Balance")
            const userUSDBalance = userBalance[symbol]
            const marginNeeded = margin * (qtyToBeOpen/qty)

            if(qtyToBeOpen > 0){
                // margin lock
                userUSDBalance!.available -= marginNeeded;
                userUSDBalance!.locked += marginNeeded
            }

            


            
        }
    }
}
