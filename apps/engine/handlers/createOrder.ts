import {
    BALANCES, FILLS, ORDERBOOKS, ORDERS, POSITIONS,
    type CreateOrderInput, type Fill, type OrderRecord, type RestingOrder
} from "../exchangeStore"

export function handleCreateOrder(payload: Record<string, unknown>) {
    const { userId, type, side, symbol, price, qty, margin, sllipage } = payload as unknown as CreateOrderInput

    let orderbook = ORDERBOOKS.get(symbol)
    if (!orderbook) {
        orderbook = {
            asks: new Map<number, RestingOrder[]>(),
            bids: new Map<number, RestingOrder[]>()
        }
        ORDERBOOKS.set(symbol, orderbook)
    }
    const userBalance = BALANCES.get(userId)

    const orderId = crypto.randomUUID()
    const createdAt = Date.now()

    if (side === "buy") {
        const sortedBestAskPrices = [...orderbook.asks.keys()].sort((a, b) => a - b)
        const BestAsk = sortedBestAskPrices[0]
        const userAssetbalance = userBalance?.["USD"]
        let totalNotionalApprox = 0

        if (!userAssetbalance) throw new Error("Wallet not initialised")
        if (userAssetbalance.available < margin) {
            throw new Error(" Insufficient Balance")
        }

        let maxPrice = 0
        if (type == "market") {
            maxPrice = ((sllipage / 100) * BestAsk! + (BestAsk!))  // sllipage calculation
            userAssetbalance.available -= margin; //balance lock for market
            userAssetbalance.locked += margin

            totalNotionalApprox = qty * maxPrice // total price approx for total qty

        } else if (type == "limit") {
            maxPrice = price!
            //balance lock for limit
            userAssetbalance.available -= margin
            userAssetbalance.locked += margin

            totalNotionalApprox = qty * maxPrice // total price approx for total qty
        }

        const fills: Fill[] = []
        let fill: Fill
        let remainingQty = qty;
        let qtyFilledSoFar = 0
        let averagePrice = 0
        let totalCostofOrder = 0


        for (const bestPrice of sortedBestAskPrices) {
            //check if the best price that gets are less then the max price
            if (remainingQty < 0) break;

            if (bestPrice > maxPrice) throw new Error(type === "market" ? "all orders are past the sllipage" : " all orders are past the limit price ")

            // now we get all the bestorders of the bestprice

            const bestOrders = orderbook.asks.get(bestPrice);
            if (!bestOrders) throw new Error("No liquidity Available")

            for (const RestingOrder of bestOrders) {
                if (remainingQty < 0) break;

                const remainiingQtyInRestingOrder = RestingOrder.qty - RestingOrder.filledQty;
                const minQtyCanbeFilled = Math.min(remainingQty, remainiingQtyInRestingOrder)
                RestingOrder.filledQty += minQtyCanbeFilled
                // now matcing will happen and for each fill the average price is calculated
                totalCostofOrder += minQtyCanbeFilled * RestingOrder.price
                qtyFilledSoFar += minQtyCanbeFilled;
                remainingQty -= minQtyCanbeFilled;
                averagePrice = totalCostofOrder / qtyFilledSoFar

                // if remainingqty > 0 ,  limit then add to the orderbook in resting and if market then cancel and say insufficient liquidity

                if (type === "market") {
                    if (remainingQty > 0) {
                        throw new Error("Insufficient Liquidity to fill all the qty")
                    }
                } else if (type === "limit") {
                    if (remainingQty > 0) {
                        orderbook.bids.set(maxPrice, [
                            ...(orderbook.bids.get(maxPrice) || []), {
                                orderId,
                                userId,
                                side,
                                type,
                                symbol,
                                price: maxPrice,
                                qty,
                                filledQty: qty - remainingQty,
                                status: "open",
                                createdAt
                            }
                        ])
                    }
                }
                //add fill
                fill = {
                    fillId: crypto.randomUUID(),
                    symbol,
                    price: RestingOrder.price,
                    qty: minQtyCanbeFilled,
                    buyOrderId: orderId,
                    sellOrderId: RestingOrder.orderId,
                    createdAt
                }

                fills.push(fill),
                    FILLS.push(fill)

                if (RestingOrder.filledQty < RestingOrder.qty) {
                    RestingOrder.status = "partially_filled"
                } else if (RestingOrder.filledQty === RestingOrder.qty) {
                    RestingOrder.status = "filled"
                }

            }

        }

        let OrderRecord: OrderRecord

        if (type === "limit") {
            OrderRecord = {
                orderId,
                userId,
                side: "buy",
                type: "limit",
                symbol,
                price: maxPrice,
                qty,
                filledQty: qtyFilledSoFar,
                status: remainingQty === 0 ? "filled" : remainingQty < qty ? "partially_filled" : "open",
                fills,
                createdAt
            }
            ORDERS.set(orderId, OrderRecord)
        }

        if (type === "market") {
            OrderRecord = {
                orderId,
                userId,
                side: "buy",
                type: "market",
                symbol,
                price: maxPrice,
                qty,
                filledQty: qtyFilledSoFar,
                status: remainingQty === 0 ? "filled" : remainingQty < qty ? "partially_filled" : "open",
                fills,
                createdAt
            }
            ORDERS.set(orderId, OrderRecord)
        }

    }

    if(side === "sell"){
            const sortedBestBidsPrices  = [...orderbook.bids.keys()].sort((a,b)=> b-a) 
            const bestBid =  sortedBestBidsPrices[0];
            const userAssetbalance = userBalance?.[symbol]
                 
    }



}
