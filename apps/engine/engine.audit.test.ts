import { describe, expect, test } from "bun:test"
import { handleCancelOrder } from "./handlers/cancelOrder"
import { handleCreateOrder } from "./handlers/createOrder"
import { handleGetDepth } from "./handlers/getDepth"
import { handleGetOrder } from "./handlers/getOrder"
import { handleGetPosition } from "./handlers/getPosition"
import { handleOnRamp } from "./handlers/onRamp"
import { BALANCES, FILLS, ORDERBOOKS, ORDERS, POSITIONS, type OrderRecord } from "./exchangeStore"

function resetStore() {
  BALANCES.clear()
  ORDERBOOKS.clear()
  POSITIONS.clear()
  ORDERS.clear()
  FILLS.length = 0
}

function fund(userId: string, amount = 1_000_000) {
  return handleOnRamp({ userId, symbol: "USD", amount })
}

function createLimit(
  userId: string,
  side: "buy" | "sell",
  price: number,
  qty: number,
  margin = 1_000,
): OrderRecord {
  return handleCreateOrder({
    userId,
    type: "limit",
    side,
    symbol: "SOL_USD_PERP",
    price,
    qty,
    margin,
    sllipage: 1,
  })
}

function createMarket(
  userId: string,
  side: "buy" | "sell",
  qty: number,
  margin = 1_000,
  sllipage = 5,
): OrderRecord {
  return handleCreateOrder({
    userId,
    type: "market",
    side,
    symbol: "SOL_USD_PERP",
    price: null,
    qty,
    margin,
    sllipage,
  })
}

describe("engine audit", () => {
  test("resting maker order record is updated when a taker fills it", () => {
    resetStore()
    fund("maker")
    fund("taker")

    const maker = createLimit("maker", "sell", 100, 10)
    const taker = createMarket("taker", "buy", 10)

    expect(taker.status).toBe("filled")

    const makerRecord = handleGetOrder({ userId: "maker", orderId: maker.orderId }).order
    expect(makerRecord?.status).toBe("filled")
    expect(makerRecord?.filledQty).toBe(10)
  })

  test("maker receives a position when their resting order is filled", () => {
    resetStore()
    fund("maker")
    fund("taker")

    createLimit("maker", "sell", 100, 10)
    createMarket("taker", "buy", 10)

    const makerPosition = handleGetPosition({ userId: "maker", symbol: "SOL_USD_PERP" }).position
    const takerPosition = handleGetPosition({ userId: "taker", symbol: "SOL_USD_PERP" }).position

    expect(makerPosition?.side).toBe("short")
    expect(makerPosition?.qty).toBe(10)
    expect(takerPosition?.side).toBe("long")
    expect(takerPosition?.qty).toBe(10)
  })

  test("cancel cannot release more margin than the remaining open quantity", () => {
    resetStore()
    fund("maker")
    fund("taker")

    const maker = createLimit("maker", "sell", 100, 10, 1_000)
    createMarket("taker", "buy", 4, 400)
    handleCancelOrder({ userId: "maker", orderId: maker.orderId })

    const balance = BALANCES.get("maker")?.USD
    expect(balance?.locked).toBe(400)
    expect(balance?.available).toBe(999_600)
  })

  test("market order with empty opposite book should not store NaN price", () => {
    resetStore()
    fund("taker")

    const order = createMarket("taker", "buy", 1)

    expect(order.status).toBe("cancelled")
    expect(Number.isNaN(order.price)).toBe(false)
  })

  test("negative on-ramp amount is rejected", () => {
    resetStore()

    expect(() => handleOnRamp({ userId: "user", symbol: "USD", amount: -100 })).toThrow()
  })

  test("invalid order numbers are rejected", () => {
    resetStore()
    fund("user")

    expect(() => createLimit("user", "buy", 100, -1)).toThrow()
    expect(() => createLimit("user", "buy", -100, 1)).toThrow()
    expect(() => createLimit("user", "buy", 100, 1, -10)).toThrow()
  })

  test("1000 deterministic stress orders preserve basic book invariants", () => {
    resetStore()

    for (let i = 0; i < 20; i++) {
      fund(`user-${i}`)
    }

    for (let i = 0; i < 1_000; i++) {
      const userId = `user-${i % 20}`
      const side = i % 2 === 0 ? "buy" : "sell"
      const type = i % 5 === 0 ? "market" : "limit"
      const price = 95 + (i % 11)
      const qty = 1 + (i % 7)
      const margin = 100 + qty * 10

      try {
        if (type === "limit") {
          createLimit(userId, side, price, qty, margin)
        } else {
          createMarket(userId, side, qty, margin, 10)
        }
      } catch {
        // The audit cares about post-state invariants after accepted and rejected operations.
      }

      for (const book of ORDERBOOKS.values()) {
        for (const [levelPrice, orders] of [...book.bids, ...book.asks]) {
          expect(levelPrice).toBeGreaterThan(0)
          expect(orders.length).toBeGreaterThan(0)
          for (const order of orders) {
            expect(order.qty - order.filledQty).toBeGreaterThan(0)
            expect(order.status === "open" || order.status === "partially_filled").toBe(true)
          }
        }
      }
    }

    const depth = handleGetDepth({ symbol: "SOL_USD_PERP", limit: 20 })
    expect(depth.bids.every((level, index, levels) => index === 0 || levels[index - 1]!.price >= level.price)).toBe(true)
    expect(depth.asks.every((level, index, levels) => index === 0 || levels[index - 1]!.price <= level.price)).toBe(true)
  })
})
