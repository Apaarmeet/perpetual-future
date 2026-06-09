import {
  BALANCES, ORDERBOOKS, ORDERS, POSITIONS, SPOT_PRICES
} from "../exchangeStore";

export function handlePriceUpdate(payload: Record<string, unknown>) {
  const { symbol, price } = payload as { symbol: string; price: number };

  if (!symbol) throw new Error("Symbol is required");
  if (!price || price <= 0) throw new Error("Invalid price");

  //  Update spot price
  SPOT_PRICES.set(symbol, price);

  const liquidations: Array<{
    userId: string;
    side: string;
    qty: number;
    margin: number;
    averagePrice: number;
  }> = [];


  for (const [userId, userPositions] of POSITIONS.entries()) {
    const position = userPositions[symbol];
    if (!position) continue;

    let shouldLiquidate = false;
    if (position.side === "long") {
      // Long liquidates if price <= liquidationPrice
      shouldLiquidate = price <= position.liquidationPrice;
    } else if (position.side === "short") {
      // Short liquidates if price >= liquidationPrice
      shouldLiquidate = price >= position.liquidationPrice;
    }

    if (shouldLiquidate) {
      console.log(`[Liquidation] Liquidating ${position.side} position for user ${userId} on ${symbol} at price ${price} (Liquidation Price: ${position.liquidationPrice})`);

      // Cancel resting orders in this market
      const orderbook = ORDERBOOKS.get(symbol);
      if (orderbook) {
        // Bids
        for (const [levelPrice, orders] of orderbook.bids.entries()) {
          const remaining = orders.filter((o) => o.userId !== userId);
          if (remaining.length > 0) {
            orderbook.bids.set(levelPrice, remaining);
          } else {
            orderbook.bids.delete(levelPrice);
          }
        }
        // Asks
        for (const [levelPrice, orders] of orderbook.asks.entries()) {
          const remaining = orders.filter((o) => o.userId !== userId);
          if (remaining.length > 0) {
            orderbook.asks.set(levelPrice, remaining);
          } else {
            orderbook.asks.delete(levelPrice);
          }
        }
      }

      // Update order records status in ORDERS map
      for (const order of ORDERS.values()) {
        if (
          order.userId === userId &&
          order.symbol === symbol &&
          (order.status === "open" || order.status === "partially_filled")
        ) {
          order.status = "cancelled";
        }
      }

      
      const userBalance = BALANCES.get(userId)?.["USD"];
      if (userBalance) {
        userBalance.locked = Math.max(0, userBalance.locked - position.margin);
      }

      // Record liquidation details
      liquidations.push({
        userId,
        side: position.side,
        qty: position.qty,
        margin: position.margin,
        averagePrice: position.averagePrice,
      });

      // Remove the position
      delete userPositions[symbol];
    }
  }

  return {
    symbol,
    price,
    liquidatedCount: liquidations.length,
    liquidations,
  };
}
