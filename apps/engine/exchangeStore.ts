import { client, connectionRedis } from "@repo/redis";
import { createClient } from "redis";
import { env } from "@perps-turbo-repo/env/server";

// Dedicated write client — never used for blocking reads
// so it is always free to xAdd/publish immediately
export const writeClient = createClient({ url: env.REDIS_URL });
writeClient.on("error", (err) => console.error("[Engine WriteClient] Redis Error", err));

export async function connectWriteClient() {
  if (!writeClient.isOpen) {
    await writeClient.connect();
  }
}

export type Side = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "open" | "partially_filled" | "filled" | "cancelled";
export type PositionSide = "long" | "short"
export interface Balance {
  available: number;
  locked: number;
}

export interface depth {
  price: number,
  qty: number
}

export interface RestingOrder {
  orderId: string;
  userId: string;
  side: Side;
  type: "limit";
  symbol: string;
  price: number;
  qty: number;
  filledQty: number;
  status: OrderStatus;
  createdAt: number;
}
export interface Fill {
  fillId: string;
  symbol: string;
  price: number;
  qty: number;
  buyOrderId: string;
  sellOrderId: string;
  createdAt: number;
}

export interface OrderRecord {
  orderId: string;
  userId: string;
  side: Side;
  type: OrderType;
  symbol: string;
  price: number | null;
  qty: number;
  filledQty: number;
  margin: number;
  status: OrderStatus;
  fills: Fill[];
  createdAt: number;
}


export interface OrderBook {
  bids: Map<number, RestingOrder[]>;
  asks: Map<number, RestingOrder[]>;
}

export interface CreateOrderInput {
  userId: string;
  type: OrderType;
  side: Side;
  symbol: string;
  price: number | null;
  qty: number;
  margin: number;
  sllipage: number    
}

export interface getUserBalanceInput {
  userId: string
}

export interface getOrderInput {
  userId: string;
  symbol: string;
}

export interface getPositionInput {
  userId: string
  symbol: string
}
export interface getUserPositionInput {
  userId: string
}
export interface getDepthInput {
  symbol: string
  limit: number
}

export interface onRampInput {
  userId : string;
  symbol: string;
  amount: number;
}

export interface Position {
    userId: string,
    market: string,
    side: PositionSide,
    qty: number,
    averagePrice: number
    margin: number,
    leverage: number,
    liquidationPrice: number
    realisedPnL: number,
    updatedAt: number
}







export type EngineCommandType =
    | "create-order"
    | "get-depth"
    | "get-user-balance"
    | "get-order"
    | "cancel-order"
    | "get-position"
    | "get-user-position"
    | "onRamp"
    | "get-open-orders"
    | "get-orders"
    | "get-fills"
    | "price-update"

export interface EngineRequest {
    correlationId: string,
    type: EngineCommandType,
    payload: Record<string, unknown>
}

export const BALANCES = new Map<string, Record<string, Balance>>();
export const ORDERBOOKS = new Map<string, OrderBook>();
export const POSITIONS = new Map<string, Record<string, Position>>();
export const ORDERS = new Map<string, OrderRecord>();
export const FILLS: Fill[] = [];
export const SPOT_PRICES = new Map<string, number>();

export function calculateLiquidationPrice(
    side: "long" | "short",
    averagePrice: number,
    qty: number,
    margin: number
): number {
    if (qty <= 0) return 0;
    if (side === "long") {
        return Math.max(0, averagePrice - margin / qty);
    } else {
        return Math.max(0, averagePrice + margin / qty);
    }
}

export async function publishDbEvent(type: "trade-event" | "order-update", data: any): Promise<void> {
    try {
        await writeClient.xAdd("db:events", "*", {
            type,
            data: JSON.stringify(data)
        });
    } catch (err) {
        console.error("Failed to publish DB event:", err);
    }
}


