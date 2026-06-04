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
export interface getDepthInput {
  symbol: string,
  limit: number
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


