import {
  BALANCES, FILLS, ORDERBOOKS, ORDERS, POSITIONS,
  type CreateOrderInput, type Fill, type OrderRecord, type RestingOrder
} from "../exchangeStore"

function applyPositionFill(userId: string, symbol: string, side: "buy" | "sell", fillQty: number, fillPrice: number, marginUsed: number, createdAt: number) {
  const userAssetbalance = BALANCES.get(userId)?.[symbol]

  let userPosition = POSITIONS.get(userId)
  if(!userPosition){
    userPosition = {};
    POSITIONS.set(userId,userPosition);
  }

  const postionSide = side === "buy" ? "long" : "short"
  const oppositeSide = side === "buy" ? "short" : "long"
  const existingUserPosition = userPosition[symbol]

  if(!existingUserPosition){
    userPosition[symbol] = {
      userId,
      market: symbol,
      side: postionSide,
      qty: fillQty,
      averagePrice: fillPrice,
      margin:marginUsed,
      leverage: (fillPrice * fillQty) / marginUsed,
      liquidationPrice: 0,
      realisedPnL: 0,
      updatedAt:createdAt
      
    }
    return ;
  }

  if(existingUserPosition.side === postionSide) {
    const totalQty = existingUserPosition.qty + fillQty
    const totalCost = existingUserPosition.averagePrice * existingUserPosition.qty  + fillPrice * fillQty

    existingUserPosition.averagePrice = totalCost/totalQty
    existingUserPosition.qty = totalQty
    existingUserPosition.margin += marginUsed
    existingUserPosition.leverage = (existingUserPosition.averagePrice * existingUserPosition.qty) / existingUserPosition.margin
    existingUserPosition.updatedAt = createdAt

    return;
  }

  if(existingUserPosition.side === oppositeSide){
    const closedQty = Math.min(fillQty, existingUserPosition.qty);
    const marginToRelease = existingUserPosition.margin * (closedQty/ existingUserPosition.qty)

    const pnl = side === "buy" ? closedQty * (existingUserPosition.averagePrice - fillPrice) : closedQty * (fillPrice - existingUserPosition.averagePrice)
    existingUserPosition.realisedPnL += pnl
    userAssetbalance!.locked -= marginToRelease
    userAssetbalance!.available += marginToRelease + pnl

    if (fillQty >= existingUserPosition.qty) {
      const remainingNewQty = fillQty - existingUserPosition.qty
      delete userPosition[symbol]

      if (remainingNewQty > 0) {
        const marginForNewPosition = marginUsed * (remainingNewQty / fillQty)
        userPosition[symbol] = {
          userId,
          market: symbol,
          side: postionSide,
          qty: remainingNewQty,
          averagePrice: fillPrice,
          margin: marginForNewPosition,
          leverage: (fillPrice * remainingNewQty) / marginForNewPosition,
          liquidationPrice: 0,
          realisedPnL: 0,
          updatedAt: createdAt
        }
      }
    } else {
      existingUserPosition.qty -= closedQty
      existingUserPosition.margin -= marginToRelease
      existingUserPosition.leverage = (existingUserPosition.averagePrice * existingUserPosition.qty) / existingUserPosition.margin
      existingUserPosition.updatedAt = createdAt
    }
  }

}

  





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
  let OrderRecord: OrderRecord = null as any

  if (side === "buy") {
    const sortedBestAskPrices = [...orderbook.asks.keys()].sort((a, b) => a - b)
    const BestAsk = sortedBestAskPrices[0]
    const userAssetbalance = userBalance?.["USD"]


    if (!userAssetbalance) throw new Error("Wallet not initialised")
    if (userAssetbalance.available < margin) {
      throw new Error(" Insufficient Balance")
    }

    let maxPrice = 0
    if (type == "market") {
      maxPrice = ((sllipage / 100) * BestAsk! + (BestAsk!))  // sllipage calculation
      userAssetbalance.available -= margin; //balance lock for market
      userAssetbalance.locked += margin



    } else if (type == "limit") {
      maxPrice = price!
      //balance lock for limit
      userAssetbalance.available -= margin
      userAssetbalance.locked += margin
    }

    const fills: Fill[] = []
    let fill: Fill
    let remainingQty = qty;
    let qtyFilledSoFar = 0
    let averagePrice = 0
    let totalCostofOrder = 0


    for (const bestPrice of sortedBestAskPrices) {
      if (remainingQty <= 0) break;

      //check if the best price that gets are less then the max price
      if (bestPrice > maxPrice) break

      // now we get all the bestorders of the bestprice

      const bestOrders = orderbook.asks.get(bestPrice);
      if (!bestOrders) throw new Error("No liquidity Available")

      for (const RestingOrder of bestOrders) {
        if (remainingQty <= 0) break;

        const remainiingQtyInRestingOrder = RestingOrder.qty - RestingOrder.filledQty;
        const minQtyCanbeFilled = Math.min(remainingQty, remainiingQtyInRestingOrder)
        RestingOrder.filledQty += minQtyCanbeFilled
        // now matcing will happen and for each fill the average price is calculated
        totalCostofOrder += minQtyCanbeFilled * RestingOrder.price
        qtyFilledSoFar += minQtyCanbeFilled;
        remainingQty -= minQtyCanbeFilled;
        averagePrice = totalCostofOrder / qtyFilledSoFar

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

        const makerOrder = ORDERS.get(RestingOrder.orderId)

        if (makerOrder) {
          makerOrder.filledQty += minQtyCanbeFilled
          makerOrder.fills.push(fill)
          applyPositionFill(makerOrder.userId, symbol, "sell", minQtyCanbeFilled, RestingOrder.price, makerOrder.margin * (minQtyCanbeFilled / makerOrder.qty), createdAt)

          if (makerOrder.filledQty < makerOrder.qty) {
            makerOrder.status = "partially_filled"
          } else {
            makerOrder.status = "filled"
          }
        }


        if (RestingOrder.filledQty < RestingOrder.qty) {
          RestingOrder.status = "partially_filled"
        } else if (RestingOrder.filledQty === RestingOrder.qty) {
          RestingOrder.status = "filled"
        }

      }

      const remainingAtLevel = bestOrders.filter((o) => o.filledQty < o.qty)
      if (remainingAtLevel.length > 0) {
        orderbook.asks.set(bestPrice, remainingAtLevel)
      } else {
        orderbook.asks.delete(bestPrice)
      }

    }

    if (remainingQty > 0 && type === "limit") {
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
        margin,
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
        margin,
        status: remainingQty === 0 ? "filled" : remainingQty < qty ? "partially_filled" : "cancelled",
        fills,
        createdAt
      }
      ORDERS.set(orderId, OrderRecord)
    }

    if (qtyFilledSoFar === 0) {
      if (type === "market") {
        userAssetbalance.locked -= margin
        userAssetbalance.available += margin
      }
      return OrderRecord
    }

    const marginUsed = margin * (qtyFilledSoFar / qty)
    let marginForPosition = marginUsed
    const leverage = (averagePrice * qtyFilledSoFar) / marginUsed
    let userPositions = POSITIONS.get(userId)

    if (!userPositions) {
      userPositions = {}
      POSITIONS.set(userId, userPositions)
    }

    let existingUserPosition = userPositions[symbol]
    if (!existingUserPosition) {
      userPositions[symbol] = {
        userId,
        market: symbol,
        side: "long",
        qty: qtyFilledSoFar,
        averagePrice,
        margin: marginUsed,
        leverage,
        liquidationPrice: 0,
        realisedPnL: 0,
        updatedAt: createdAt
      }
    } else if (existingUserPosition.side === "long") {
      const totalQty = existingUserPosition.qty + qtyFilledSoFar
      const totalCost = existingUserPosition.averagePrice * existingUserPosition.qty + totalCostofOrder

      existingUserPosition.averagePrice = totalCost / totalQty
      existingUserPosition.qty = totalQty,
        existingUserPosition.margin += marginUsed
      existingUserPosition.leverage = (existingUserPosition.averagePrice * existingUserPosition.qty) / existingUserPosition.margin
      existingUserPosition.updatedAt = createdAt
    } else {
      const closedQty = Math.min(qtyFilledSoFar, existingUserPosition.qty)
      const marginToRelease = existingUserPosition.margin * (closedQty / existingUserPosition.qty)
      const pnl = closedQty * (existingUserPosition.averagePrice - averagePrice)
      existingUserPosition.realisedPnL += pnl

      userAssetbalance.locked -= marginToRelease
      userAssetbalance.available += marginToRelease + pnl

      if (qtyFilledSoFar >= existingUserPosition.qty) {
        const remainingNewQty = qtyFilledSoFar - existingUserPosition.qty
        delete userPositions[symbol]

        if (remainingNewQty > 0) {
          const marginForNewPosition = margin * (remainingNewQty / qty)
          marginForPosition = marginForNewPosition
          userPositions[symbol] = {
            userId,
            market: symbol,
            side: "long",
            qty: remainingNewQty,
            averagePrice,
            margin: marginForNewPosition,
            leverage: (averagePrice * remainingNewQty) / marginForNewPosition,
            liquidationPrice: 0,
            realisedPnL: 0,
            updatedAt: createdAt
          }
        } else {
          marginForPosition = 0
        }
      } else {
        existingUserPosition.qty -= closedQty
        existingUserPosition.margin -= marginToRelease
        existingUserPosition.leverage = (existingUserPosition.averagePrice * existingUserPosition.qty) / existingUserPosition.margin
        existingUserPosition.updatedAt = createdAt
        marginForPosition = 0
      }
    }

    const unusedMargin = margin - marginForPosition
    if (unusedMargin > 0) {
      userAssetbalance.locked -= unusedMargin
      userAssetbalance.available += unusedMargin
    }

  }

  if (side === "sell") {
    const sortedBestBidsPrices = [...orderbook.bids.keys()].sort((a, b) => b - a)
    const bestBid = sortedBestBidsPrices[0];

    const userAssetbalance = userBalance?.["USD"]


    if (!userAssetbalance) {
      throw new Error("User Wallet not initialised")
    }
    if (userAssetbalance.available < margin) {
      throw new Error("Insufficient Balance")
    }

    let minSellPrice = 0

    if (type === "market") {
      //sllipage calculation 
      minSellPrice = ((bestBid!) - (sllipage / 100) * bestBid!)

      userAssetbalance.available -= margin
      userAssetbalance.locked += margin
    }
    if (type === "limit") {
      minSellPrice = price!

      userAssetbalance.available -= margin
      userAssetbalance.locked += margin
    }
    let remainingQty = qty;
    let qtyFilledSoFar = 0;
    let averagePrice = 0;
    let totoalCostOfOrder = 0;
    let fill: Fill
    let fills: Fill[] = [];

    for (const bestprice of sortedBestBidsPrices) {

      if (remainingQty <= 0) break;

      if (bestprice < minSellPrice) break


      const bestOrders = orderbook.bids.get(bestprice);
      if (!bestOrders) throw new Error("No liquidity Available")

      for (const RestingOrder of bestOrders) {
        if (remainingQty <= 0) break

        const remainiingQtyInRestingOrder = RestingOrder.qty - RestingOrder.filledQty;
        const minQtyCanbeFilled = Math.min(remainingQty, remainiingQtyInRestingOrder)

        RestingOrder.filledQty += minQtyCanbeFilled
        qtyFilledSoFar += minQtyCanbeFilled
        remainingQty -= minQtyCanbeFilled
        totoalCostOfOrder += minQtyCanbeFilled * RestingOrder.price
        averagePrice = totoalCostOfOrder / qtyFilledSoFar


        //add fill
        fill = {
          fillId: crypto.randomUUID(),
          symbol,
          price: RestingOrder.price,
          qty: minQtyCanbeFilled,
          buyOrderId: RestingOrder.orderId,
          sellOrderId: orderId,
          createdAt
        }
        fills.push(fill),
          FILLS.push(fill)

        const makerOrder = ORDERS.get(RestingOrder.orderId)

        if (makerOrder) {
          makerOrder.filledQty += minQtyCanbeFilled
          makerOrder.fills.push(fill)
          applyPositionFill(makerOrder.userId, symbol, "buy", minQtyCanbeFilled, RestingOrder.price, makerOrder.margin * (minQtyCanbeFilled / makerOrder.qty), createdAt)

          if (makerOrder.filledQty < makerOrder.qty) {
            makerOrder.status = "partially_filled"
          } else {
            makerOrder.status = "filled"
          }
        }

        if (RestingOrder.filledQty < RestingOrder.qty) {
          RestingOrder.status = "partially_filled"
        } else if (RestingOrder.filledQty === RestingOrder.qty) {
          RestingOrder.status = "filled"
        }

      }

      const remainingAtLevelSell = bestOrders.filter((o) => o.filledQty < o.qty)
      if (remainingAtLevelSell.length > 0) {
        orderbook.bids.set(bestprice, remainingAtLevelSell)
      } else {
        orderbook.bids.delete(bestprice)
      }

    }

    if (remainingQty > 0 && type === "limit") {
      orderbook.asks.set(minSellPrice, [...(orderbook.asks.get(minSellPrice) || []), {
        orderId,
        userId,
        side,
        type,
        symbol,
        price: minSellPrice,
        qty,
        filledQty: qty - remainingQty,
        status: qty - remainingQty > 0 ? "partially_filled" : "open",
        createdAt
      }])
    }

    if (type === "limit") {
      OrderRecord = {
        orderId,
        userId,
        side: "sell",
        type: "limit",
        symbol,
        price: minSellPrice,
        qty,
        filledQty: qtyFilledSoFar,
        margin,
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
        side: "sell",
        type: "market",
        symbol,
        price: minSellPrice,
        qty,
        filledQty: qtyFilledSoFar,
        margin,
        status: remainingQty === 0 ? "filled" : remainingQty < qty ? "partially_filled" : "cancelled",
        fills,
        createdAt
      }
      ORDERS.set(orderId, OrderRecord)
    }

    if (qtyFilledSoFar === 0) {
      if (type === "market") {
        userAssetbalance.locked -= margin
        userAssetbalance.available += margin
      }
      return OrderRecord
    }

    const marginUsedSell = margin * (qtyFilledSoFar / qty)
    let marginForPositionSell = marginUsedSell
    const leverageSell = (averagePrice * qtyFilledSoFar) / marginUsedSell
    let userPositionsSell = POSITIONS.get(userId)

    if (!userPositionsSell) {
      userPositionsSell = {}
      POSITIONS.set(userId, userPositionsSell)
    }

    let existingUserPositionSell = userPositionsSell[symbol]
    if (!existingUserPositionSell) {
      userPositionsSell[symbol] = {
        userId,
        market: symbol,
        side: "short",
        qty: qtyFilledSoFar,
        averagePrice,
        margin: marginUsedSell,
        leverage: leverageSell,
        liquidationPrice: 0,
        realisedPnL: 0,
        updatedAt: createdAt
      }
    } else if (existingUserPositionSell.side === "short") {
      const totalQty = existingUserPositionSell.qty + qtyFilledSoFar
      const totalCost = existingUserPositionSell.averagePrice * existingUserPositionSell.qty + totoalCostOfOrder

      existingUserPositionSell.averagePrice = totalCost / totalQty
      existingUserPositionSell.qty = totalQty
      existingUserPositionSell.margin += marginUsedSell
      existingUserPositionSell.leverage = (existingUserPositionSell.averagePrice * existingUserPositionSell.qty) / existingUserPositionSell.margin
      existingUserPositionSell.updatedAt = createdAt
    } else {
      const closedQtySell = Math.min(qtyFilledSoFar, existingUserPositionSell.qty)
      const marginToReleaseSell = existingUserPositionSell.margin * (closedQtySell / existingUserPositionSell.qty)
      const pnlSell = closedQtySell * (averagePrice - existingUserPositionSell.averagePrice)
      existingUserPositionSell.realisedPnL += pnlSell

      userAssetbalance.locked -= marginToReleaseSell
      userAssetbalance.available += marginToReleaseSell + pnlSell

      if (qtyFilledSoFar >= existingUserPositionSell.qty) {
        const remainingNewQtySell = qtyFilledSoFar - existingUserPositionSell.qty
        delete userPositionsSell[symbol]

        if (remainingNewQtySell > 0) {
          const marginForNewPosition = margin * (remainingNewQtySell / qty)
          marginForPositionSell = marginForNewPosition
          userPositionsSell[symbol] = {
            userId,
            market: symbol,
            side: "short",
            qty: remainingNewQtySell,
            averagePrice,
            margin: marginForNewPosition,
            leverage: (averagePrice * remainingNewQtySell) / marginForNewPosition,
            liquidationPrice: 0,
            realisedPnL: 0,
            updatedAt: createdAt
          }
        } else {
          marginForPositionSell = 0
        }
      } else {
        existingUserPositionSell.qty -= closedQtySell
        existingUserPositionSell.margin -= marginToReleaseSell
        existingUserPositionSell.leverage = (existingUserPositionSell.averagePrice * existingUserPositionSell.qty) / existingUserPositionSell.margin
        existingUserPositionSell.updatedAt = createdAt
        marginForPositionSell = 0
      }
    }

    const unusedMarginSell = margin - marginForPositionSell
    if (unusedMarginSell > 0) {
      userAssetbalance.locked -= unusedMarginSell
      userAssetbalance.available += unusedMarginSell
    }

  }

  return OrderRecord
}
