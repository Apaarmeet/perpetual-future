import { describe, test, expect, beforeEach } from "bun:test"
import { handleCreateOrder } from "../createOrder"
import {
    BALANCES, ORDERBOOKS, POSITIONS, ORDERS, FILLS,
    type RestingOrder
} from "../../exchangeStore"

const USER_ID = "user1"
const SYMBOL = "BTCUSD"

function seedBalance(available: number, locked = 0) {
    BALANCES.set(USER_ID, { USD: { available, locked } })
}

function seedAsk(price: number, qty: number, userId = "seller1") {
    const ob = ORDERBOOKS.get(SYMBOL) ?? { asks: new Map(), bids: new Map() }
    const orders = ob.asks.get(price) ?? []
    orders.push({
        orderId: crypto.randomUUID(),
        userId,
        side: "sell",
        type: "limit",
        symbol: SYMBOL,
        price,
        qty,
        filledQty: 0,
        status: "open",
        createdAt: Date.now()
    })
    ob.asks.set(price, orders)
    ORDERBOOKS.set(SYMBOL, ob)
}

function seedShortPosition(qty: number, avgPrice: number, margin: number) {
    if (!POSITIONS.has(USER_ID)) POSITIONS.set(USER_ID, {})
    POSITIONS.get(USER_ID)![SYMBOL] = {
        userId: USER_ID,
        market: SYMBOL,
        side: "short",
        qty,
        averagePrice: avgPrice,
        margin,
        leverage: (avgPrice * qty) / margin,
        liquidationPrice: avgPrice * (1 + 1 / ((avgPrice * qty) / margin)),
        realisedPnL: 0,
        updatedAt: Date.now()
    }
}

function seedLongPosition(qty: number, avgPrice: number, margin: number) {
    if (!POSITIONS.has(USER_ID)) POSITIONS.set(USER_ID, {})
    POSITIONS.get(USER_ID)![SYMBOL] = {
        userId: USER_ID,
        market: SYMBOL,
        side: "long",
        qty,
        averagePrice: avgPrice,
        margin,
        leverage: (avgPrice * qty) / margin,
        liquidationPrice: avgPrice * (1 - 1 / ((avgPrice * qty) / margin)),
        realisedPnL: 0,
        updatedAt: Date.now()
    }
}

function resetStores() {
    BALANCES.clear()
    ORDERBOOKS.clear()
    POSITIONS.clear()
    ORDERS.clear()
    FILLS.length = 0
}

beforeEach(() => {
    resetStores()
})

describe("market buy — full open (no existing position)", () => {

    test("opens a long position with correct qty, price, margin, leverage", () => {
        seedBalance(10000)
        seedAsk(100, 10)

        const result = handleCreateOrder({
            userId: USER_ID,
            type: "market",
            side: "buy",
            symbol: SYMBOL,
            price: null,
            qty: 5,
            margin: 500
        })

        expect(result).toBeDefined()
        expect(result!.orderId).toBeDefined()
        expect(result!.orderRecord.status).toBe("filled")
        expect(result!.fills.length).toBe(1)

        const pos = POSITIONS.get(USER_ID)![SYMBOL]
        expect(pos).toBeDefined()
        expect(pos!.side).toBe("long")
        expect(pos!.qty).toBe(5)
        expect(pos!.averagePrice).toBe(100)
        expect(pos!.margin).toBeCloseTo(500, 1)
        expect(pos!.leverage).toBeCloseTo(1, 0)

        const balance = BALANCES.get(USER_ID)!.USD
        expect(balance!.available).toBe(10000 - 500)
        expect(balance!.locked).toBe(500)
    })

    test("multiple price levels — calculates VWAP correctly", () => {
        seedBalance(50000)
        seedAsk(100, 2)
        seedAsk(102, 3)
        seedAsk(104, 5)

        const result = handleCreateOrder({
            userId: USER_ID,
            type: "market",
            side: "buy",
            symbol: SYMBOL,
            price: null,
            qty: 5,
            margin: 5000
        })

        expect(result!.fills.length).toBe(2)
        const expectedVWAP = (100 * 2 + 102 * 3) / 5
        expect(result!.orderRecord.price).toBeCloseTo(expectedVWAP, 1)

        const pos = POSITIONS.get(USER_ID)![SYMBOL]
        expect(pos!.averagePrice).toBeCloseTo(expectedVWAP, 1)
    })

    test("liquidation price is below entry for long", () => {
        seedBalance(10000)
        seedAsk(100, 10)

        const result = handleCreateOrder({
            userId: USER_ID,
            type: "market",
            side: "buy",
            symbol: SYMBOL,
            price: null,
            qty: 5,
            margin: 500
        })

        const pos = POSITIONS.get(USER_ID)![SYMBOL]
        expect(pos!.liquidationPrice).toBeLessThan(pos!.averagePrice)
        expect(pos!.liquidationPrice).toBeCloseTo(100 * (1 - 1 / 1), 0)
    })
})

describe("market buy — full close (existing short)", () => {

    test("closes short position and releases margin + pnl", () => {
        seedBalance(10000)
        seedAsk(100, 10)
        seedShortPosition(2, 110, 220) // shorted 2 BTC at $110, margin = $220

        const result = handleCreateOrder({
            userId: USER_ID,
            type: "market",
            side: "buy",
            symbol: SYMBOL,
            price: null,
            qty: 2,
            margin: 200
        })

        // Position should be deleted
        expect(POSITIONS.get(USER_ID)?.[SYMBOL]).toBeUndefined()

        // Realised PnL = (110 - 100) * 2 = +20
        const balance = BALANCES.get(USER_ID)!.USD
        expect(balance!.available).toBe(10000 + 220 + 20)
        expect(balance!.locked).toBe(0)
    })

    test("partial close — reduces short position", () => {
        seedBalance(10000)
        seedAsk(100, 5)
        seedShortPosition(10, 110, 1100)

        const result = handleCreateOrder({
            userId: USER_ID,
            type: "market",
            side: "buy",
            symbol: SYMBOL,
            price: null,
            qty: 3,
            margin: 300
        })

        const pos = POSITIONS.get(USER_ID)![SYMBOL]
        expect(pos).toBeDefined()
        expect(pos!.side).toBe("short")
        expect(pos!.qty).toBe(7) // 10 - 3
        expect(pos!.margin).toBeCloseTo(770, 0) // 1100 * 7/10

        // PnL = (110 - 100) * 3 = +30
        const balance = BALANCES.get(USER_ID)!.USD
        expect(balance!.available).toBe(10000 + 330 + 30)
    })
})

describe("market buy — close + open (existing short, buy more)", () => {

    test("closes short and opens long with remaining qty", () => {
        seedBalance(10000)
        seedAsk(100, 10)
        seedShortPosition(2, 110, 220)

        const result = handleCreateOrder({
            userId: USER_ID,
            type: "market",
            side: "buy",
            symbol: SYMBOL,
            price: null,
            qty: 5,
            margin: 500
        })

        // Short should be gone
        const pos = POSITIONS.get(USER_ID)![SYMBOL]
        expect(pos!.side).toBe("long")
        expect(pos!.qty).toBe(3) // 5 - 2
    })
})

describe("market buy — add to existing long", () => {

    test("adds to existing long with weighted avg price", () => {
        seedBalance(20000)
        seedAsk(200, 10)
        seedLongPosition(2, 150, 300)

        const result = handleCreateOrder({
            userId: USER_ID,
            type: "market",
            side: "buy",
            symbol: SYMBOL,
            price: null,
            qty: 3,
            margin: 600
        })

        const pos = POSITIONS.get(USER_ID)![SYMBOL]
        expect(pos!.side).toBe("long")
        expect(pos!.qty).toBe(5) // 2 + 3

        const expectedAvg = (150 * 2 + 200 * 3) / 5
        expect(pos!.averagePrice).toBeCloseTo(expectedAvg, 1)
        expect(pos!.margin).toBeCloseTo(900, 0)
        expect(pos!.leverage).toBeCloseTo((expectedAvg * 5) / 900, 1)
    })
})

describe("market buy — edge cases", () => {

    test("throws error when no liquidity", () => {
        seedBalance(10000)

        expect(() => handleCreateOrder({
            userId: USER_ID,
            type: "market",
            side: "buy",
            symbol: SYMBOL,
            price: null,
            qty: 5,
            margin: 500
        })).toThrow("No liquidity Available")
    })

    test("partial fill refunds unused margin", () => {
        seedBalance(10000)
        seedAsk(100, 2) // only 2 BTC available

        const result = handleCreateOrder({
            userId: USER_ID,
            type: "market",
            side: "buy",
            symbol: SYMBOL,
            price: null,
            qty: 5,
            margin: 500
        })

        expect(result!.orderRecord.status).toBe("partially_filled")
        expect(result!.fills.length).toBe(1)
        expect(result!.orderRecord.filledQty).toBe(2)

        const pos = POSITIONS.get(USER_ID)![SYMBOL]
        expect(pos!.qty).toBe(2)

        // marginNeeded = 500, totalMarginUsed = 500 * (2/5) = 200
        // refundMargin = 500 - 200 = 300
        const balance = BALANCES.get(USER_ID)!.USD
        expect(balance!.available).toBe(10000 - 200)
        expect(balance!.locked).toBe(200)
    })

    test("slippage limit — stops filling beyond 5%", () => {
        seedBalance(50000)
        seedAsk(100, 10)
        seedAsk(200, 10) // > 5% above best ask

        const result = handleCreateOrder({
            userId: USER_ID,
            type: "market",
            side: "buy",
            symbol: SYMBOL,
            price: null,
            qty: 20,
            margin: 2000
        })

        // Should only fill at $100 level (10 BTC), $200 exceeds maxPrice = $105
        expect(result!.orderRecord.filledQty).toBe(10)
        expect(result!.fills.length).toBe(1)
        expect(result!.fills[0]!.price).toBe(100)
    })

    test("close-only order doesn't need balance check", () => {
        // User has $0 available but has a short position
        seedBalance(0)
        seedAsk(100, 5)
        seedShortPosition(3, 120, 360)

        const result = handleCreateOrder({
            userId: USER_ID,
            type: "market",
            side: "buy",
            symbol: SYMBOL,
            price: null,
            qty: 3,
            margin: 300
        })

        expect(POSITIONS.get(USER_ID)?.[SYMBOL]).toBeUndefined()
        // PnL = (120 - 100) * 3 = +60
        const balance = BALANCES.get(USER_ID)!.USD
        expect(balance!.available).toBe(0 + 360 + 60) // margin released + profit
    })

    test("close-only order with zero balance — partial fill refund doesn't touch locked", () => {
        seedBalance(0)
        seedAsk(100, 2)
        seedShortPosition(5, 110, 550)

        const result = handleCreateOrder({
            userId: USER_ID,
            type: "market",
            side: "buy",
            symbol: SYMBOL,
            price: null,
            qty: 5,
            margin: 500
        })

        // Only 2 BTC from orderbook, should close 2 of 5 short
        const pos = POSITIONS.get(USER_ID)![SYMBOL]
        expect(pos!.qty).toBe(3)
        expect(pos!.side).toBe("short")

        const balance = BALANCES.get(USER_ID)!.USD
        expect(balance!.locked).toBe(0)
    })
})
