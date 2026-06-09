"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ISeriesApi, CandlestickSeries } from "lightweight-charts";
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Layers, 
  History, 
  User, 
  Plus, 
  X, 
  ArrowRightLeft, 
  Play, 
  Sparkles 
} from "lucide-react";

const API_URL = "http://127.0.0.1:3000";
const WS_URL = "ws://127.0.0.1:3002";
const SYMBOL = "SOL_USD_PERP";

interface OrderBookLevel {
  price: number;
  qty: number;
}

interface Trade {
  fillId: string;
  symbol: string;
  price: number;
  qty: number;
  createdAt: number;
}

interface Position {
  userId: string;
  market: string;
  side: "long" | "short";
  qty: number;
  averagePrice: number;
  margin: number;
  leverage: number;
  liquidationPrice: number;
  realisedPnL: number;
}

interface OpenOrder {
  orderId: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: number;
  qty: number;
  filledQty: number;
  margin: number;
  status: string;
  createdAt: number;
}

export default function TradeClient() {
  // Auth State
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [authEmail, setAuthEmail] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  // Funding state
  const [onrampAmount, setOnrampAmount] = useState("5000");
  const [showOnrampModal, setShowOnrampModal] = useState(false);

  // Financial State
  const [usdBalance, setUsdBalance] = useState({ available: 0, locked: 0 });
  const [positions, setPositions] = useState<Position[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [fills, setFills] = useState<Trade[]>([]);

  // Public Orderbook & Trades State
  const [bids, setBids] = useState<OrderBookLevel[]>([]);
  const [asks, setAsks] = useState<OrderBookLevel[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [tickerPrice, setTickerPrice] = useState<number>(100.0);
  const [prevTickerPrice, setPrevTickerPrice] = useState<number>(100.0);

  // Active Bottom Tab
  const [bottomTab, setBottomTab] = useState<"positions" | "orders" | "fills">("positions");

  // Terminal Order Form
  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [orderPrice, setOrderPrice] = useState("100.00");
  const [orderQty, setOrderQty] = useState("10");
  const [leverage, setLeverage] = useState(10);
  const [orderError, setOrderError] = useState("");
  const [orderSuccess, setOrderSuccess] = useState("");

  // Chart References
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // Check Local Storage for Auth
  useEffect(() => {
    const savedToken = localStorage.getItem("perps_token");
    const savedUser = localStorage.getItem("perps_user");
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
  }, []);

  // Fetch Private Data (Balance, Positions, Orders, Fills) when logged in
  const fetchPrivateState = async () => {
    if (!token) return;
    try {
      // 1. Fetch Balance
      const balRes = await fetch(`${API_URL}/api/engine/equity/available`, {
        headers: { "Authorization": token }
      });
      if (balRes.ok) {
        const balData = await balRes.json();
        const usd = balData.response?.balance?.USD;
        if (usd) {
          setUsdBalance({
            available: parseFloat(usd.available || "0"),
            locked: parseFloat(usd.locked || "0")
          });
        }
      }

      // 2. Fetch Position
      const posRes = await fetch(`${API_URL}/api/engine/positions/open/${SYMBOL}`, {
        headers: { "Authorization": token }
      });
      if (posRes.ok) {
        const posData = await posRes.json();
        const pos = posData.response?.position;
        if (pos) {
          setPositions([
            {
              userId: pos.userId,
              market: pos.market,
              side: pos.side.toLowerCase(),
              qty: parseFloat(pos.qty),
              averagePrice: parseFloat(pos.averagePrice),
              margin: parseFloat(pos.margin),
              leverage: parseFloat(pos.leverage),
              liquidationPrice: parseFloat(pos.liquidationPrice),
              realisedPnL: parseFloat(pos.realisedPnL)
            }
          ]);
        } else {
          setPositions([]);
        }
      }

      // 3. Fetch Open Orders
      const ordRes = await fetch(`${API_URL}/api/engine/orders/open/${SYMBOL}`, {
        headers: { "Authorization": token }
      });
      if (ordRes.ok) {
        const ordData = await ordRes.json();
        const ords = ordData.response?.orders || [];
        setOpenOrders(ords.map((o: any) => ({
          orderId: o.orderId,
          side: o.side.toLowerCase(),
          type: o.type.toLowerCase(),
          price: parseFloat(o.price || "0"),
          qty: parseFloat(o.qty),
          filledQty: parseFloat(o.filledQty),
          margin: parseFloat(o.margin),
          status: o.status,
          createdAt: o.createdAt
        })));
      }

      // 4. Fetch Fills
      const fillsRes = await fetch(`${API_URL}/api/engine/fills?symbol=${SYMBOL}`, {
        headers: { "Authorization": token }
      });
      if (fillsRes.ok) {
        const fillsData = await fillsRes.json();
        const f = fillsData.response?.fills || [];
        setFills(f.map((x: any) => ({
          fillId: x.fillId,
          symbol: x.symbol,
          price: parseFloat(x.price),
          qty: parseFloat(x.qty),
          createdAt: x.createdAt
        })));
      }
    } catch (err) {
      console.error("Failed to fetch private state", err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchPrivateState();
    } else {
      setUsdBalance({ available: 0, locked: 0 });
      setPositions([]);
      setOpenOrders([]);
      setFills([]);
    }
  }, [token]);

  // Load Historical Candles & Initialize TradingView Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: "#0c0c10" },
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.03)" },
        horzLines: { color: "rgba(255, 255, 255, 0.03)" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    candlestickSeriesRef.current = candlestickSeries;

    // Fetch REST Historical Candles
    fetch(`${API_URL}/api/engine/candles?symbol=${SYMBOL}&interval=1m`)
      .then(res => res.json())
      .then(data => {
        if (data.candles && data.candles.length > 0) {
          // Sort candles chronologically and format time
          const formatted = data.candles.map((c: any) => ({
            time: Math.floor(c.time / 1000) as any,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
          }));
          candlestickSeries.setData(formatted);
        }
      })
      .catch(err => console.error("Failed to load historical candles", err));

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  // Set up WebSockets for Public Streams (orderbook, trade history, candles, ticker)
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    function connect() {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log("[WS Client] Connected to WS Server.");
        // Subscribe to public streams
        ws.send(JSON.stringify({ action: "subscribe", room: `orderbook:${SYMBOL}` }));
        ws.send(JSON.stringify({ action: "subscribe", room: `trade:${SYMBOL}` }));
        ws.send(JSON.stringify({ action: "subscribe", room: `candle:${SYMBOL}` }));
        ws.send(JSON.stringify({ action: "subscribe", room: `ticker:${SYMBOL}` }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        // Skip subscription confirmations and error messages (they have no 'data' field)
        if (!msg.data || msg.status === "subscribed" || msg.status === "unsubscribed" || msg.error) {
          return;
        }
        const { room, data } = msg;

        if (room === `orderbook:${SYMBOL}`) {
          // Limit level arrays
          const rawBids = data.bids || [];
          const rawAsks = data.asks || [];
          // Sort bids high to low
          setBids(rawBids.sort((a: any, b: any) => b.price - a.price));
          // Sort asks low to high
          setAsks(rawAsks.sort((a: any, b: any) => a.price - b.price));
        } else if (room === `trade:${SYMBOL}` && data.fillId) {
          setRecentTrades(prev => [
            {
              fillId: data.fillId,
              symbol: data.symbol,
              price: data.price,
              qty: data.qty,
              createdAt: data.createdAt
            },
            ...prev.slice(0, 49)
          ]);
          // Trigger private update if trade happens to refresh balance/positions/orders
          fetchPrivateState();
        } else if (room === `ticker:${SYMBOL}` && data.price !== undefined) {
          setTickerPrice(prev => {
            setPrevTickerPrice(prev);
            return data.price;
          });
        } else if (room === `candle:${SYMBOL}` && data.timestamp !== undefined) {
          if (candlestickSeriesRef.current) {
            candlestickSeriesRef.current.update({
              time: Math.floor(data.timestamp / 1000) as any,
              open: data.open,
              high: data.high,
              low: data.low,
              close: data.close
            });
          }
        }
      };

      ws.onclose = () => {
        console.log("[WS Client] Disconnected. Reconnecting in 3 seconds...");
        if (mounted) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (err) => {
        console.error("[WS Client] Error:", err);
        ws.close();
      };
    }

    connect();

    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws.close();
    };
  }, [token]); // Re-connect or trigger state on token change

  // Execute Order Placement
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError("");
    setOrderSuccess("");

    if (!token) {
      setOrderError("Please sign in to place orders.");
      return;
    }

    const price = orderType === "limit" ? parseFloat(orderPrice) : null;
    const qty = parseFloat(orderQty);
    const estPrice = orderType === "limit" ? parseFloat(orderPrice) : tickerPrice;
    
    // Auto-calculate margin based on leverage
    const margin = parseFloat(((estPrice * qty) / leverage).toFixed(2));

    try {
      const res = await fetch(`${API_URL}/api/engine/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token || ""
        },
        body: JSON.stringify({
          userId: user.id,
          type: orderType,
          side: orderSide,
          symbol: SYMBOL,
          price,
          qty,
          margin,
          sllipage: 5 // Default slippage
        })
      });

      const body = await res.json();
      if (!res.ok) {
        setOrderError(body.error || "Order placement failed.");
      } else {
        setOrderSuccess(`Order placed successfully! ID: ${body.response?.orderId || ""}`);
        // Refresh local private state
        fetchPrivateState();
      }
    } catch (err) {
      setOrderError("Network error. Please try again.");
    }
  };

  // Cancel Order
  const handleCancelOrder = async (orderId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/engine/order`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token || ""
        },
        body: JSON.stringify({
          userId: user.id,
          orderId
        })
      });
      if (res.ok) {
        fetchPrivateState();
      }
    } catch (err) {
      console.error("Cancel order error:", err);
    }
  };

  // Execute On-ramp
  const handleOnramp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/engine/onramp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token || ""
        },
        body: JSON.stringify({
          userId: user.id,
          amount: parseFloat(onrampAmount)
        })
      });

      if (res.ok) {
        setShowOnrampModal(false);
        fetchPrivateState();
      }
    } catch (err) {
      console.error("Funding error", err);
    }
  };

  // Sign In / Sign Up handler
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError("");
    try {
      if (authMode === "signup") {
        // 1. Register the account
        const signupRes = await fetch(`${API_URL}/api/user/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: authEmail, name: authName, password: authPassword })
        });
        const signupData = await signupRes.json();
        if (!signupRes.ok) {
          setOrderError(signupData.error || "Signup failed.");
          return;
        }
        // 2. Auto sign-in immediately after signup
        const signinRes = await fetch(`${API_URL}/api/user/signin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: authEmail, password: authPassword })
        });
        const signinData = await signinRes.json();
        if (!signinRes.ok) {
          setOrderError(signinData.error || "Auto sign-in failed. Please sign in manually.");
          setAuthMode("signin");
          return;
        }
        localStorage.setItem("perps_token", signinData.token);
        localStorage.setItem("perps_user", JSON.stringify(signinData.user));
        setToken(signinData.token);
        setUser(signinData.user);
        setShowAuthModal(false);
      } else {
        // Sign-in flow
        const res = await fetch(`${API_URL}/api/user/signin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: authEmail, password: authPassword })
        });
        const data = await res.json();
        if (!res.ok) {
          setOrderError(data.error || "Authentication failed.");
          return;
        }
        localStorage.setItem("perps_token", data.token);
        localStorage.setItem("perps_user", JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        setShowAuthModal(false);
      }
    } catch (err) {
      setOrderError("Network error. Please try again.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("perps_token");
    localStorage.removeItem("perps_user");
    setToken(null);
    setUser(null);
  };

  // Computed layout calculations
  const orderbookTotalQty = [...bids, ...asks].reduce((sum, item) => sum + item.qty, 0) || 1;

  // Margin calculation for trade card display
  const calculatedMargin = parseFloat((((orderType === "limit" ? parseFloat(orderPrice) || tickerPrice : tickerPrice) * (parseFloat(orderQty) || 0)) / leverage).toFixed(2));

  return (
    <div className="min-h-screen bg-[#08080a] text-[#f4f4f7] flex flex-col antialiased">
      {/* HEADER SECTION */}
      <header className="h-16 border-b border-[rgba(255,255,255,0.06)] bg-[rgba(12,12,16,0.65)] backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-40">
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-md">
              <ArrowRightLeft className="w-4 h-4 text-[#08080a] stroke-[2.5]" />
            </div>
            <span className="font-bold tracking-tight text-lg bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              PERPS TURBO
            </span>
          </div>

          {/* SOL Ticker Card */}
          <div className="flex items-center space-x-6 text-sm">
            <div>
              <span className="text-[#a1a1aa] block text-xs">Market</span>
              <span className="font-semibold">{SYMBOL}</span>
            </div>
            <div>
              <span className="text-[#a1a1aa] block text-xs">Price</span>
              <span className={`font-mono text-base font-bold flex items-center transition-colors duration-300 ${
                tickerPrice >= prevTickerPrice ? "text-emerald-400" : "text-red-400"
              }`}>
                {tickerPrice.toFixed(2)}
                {tickerPrice >= prevTickerPrice ? (
                  <TrendingUp className="w-3.5 h-3.5 ml-1 inline" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 ml-1 inline" />
                )}
              </span>
            </div>
            <div className="hidden sm:block">
              <span className="text-[#a1a1aa] block text-xs">Contract</span>
              <span>Perpetual Futures</span>
            </div>
          </div>
        </div>

        {/* AUTH CONTROLS */}
        <div className="flex items-center space-x-4">
          {user ? (
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => setShowOnrampModal(true)}
                className="px-3.5 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-400 text-sm font-medium transition flex items-center"
              >
                <Wallet className="w-3.5 h-3.5 mr-2" />
                Deposit Funds
              </button>
              <div className="flex items-center space-x-2 bg-[rgba(255,255,255,0.04)] px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.06)]">
                <User className="w-4 h-4 text-[#a1a1aa]" />
                <span className="text-sm font-medium max-w-[120px] truncate">{user.name}</span>
              </div>
              <button 
                onClick={handleLogout}
                className="text-sm text-[#a1a1aa] hover:text-[#f4f4f7] transition"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button 
              onClick={() => { setAuthMode("signup"); setShowAuthModal(true); setOrderError(""); }}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-[#08080a] text-sm font-bold shadow-lg transition"
            >
              Connect Profile
            </button>
          )}
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-3 p-3 h-[calc(100vh-4rem)] overflow-hidden">
        {/* CHART & POSITIONS PANEL (Left, 3 columns wide) */}
        <div className="lg:col-span-3 flex flex-col gap-3 h-full overflow-hidden">
          {/* Chart Container */}
          <div className="flex-1 bg-[rgba(12,12,16,0.65)] border border-[rgba(255,255,255,0.06)] rounded-xl relative overflow-hidden flex flex-col min-h-[300px]">
            <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between z-10 bg-[rgba(12,12,16,0.8)]">
              <span className="text-sm font-bold tracking-tight flex items-center">
                <Sparkles className="w-4 h-4 text-emerald-400 mr-2" />
                Interactive K-Line Chart (1m)
              </span>
              <span className="text-xs text-[#a1a1aa]">SOL Price updates live</span>
            </div>
            <div ref={chartContainerRef} className="flex-1 w-full" />
          </div>

          {/* Positions, Orders, Fills Panel */}
          <div className="h-[260px] bg-[rgba(12,12,16,0.65)] border border-[rgba(255,255,255,0.06)] rounded-xl flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="border-b border-[rgba(255,255,255,0.06)] flex items-center bg-[rgba(10,10,12,0.4)]">
              <button 
                onClick={() => setBottomTab("positions")}
                className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center ${
                  bottomTab === "positions" 
                    ? "border-emerald-400 text-emerald-400 bg-[rgba(255,255,255,0.02)]" 
                    : "border-transparent text-[#a1a1aa] hover:text-[#f4f4f7]"
                }`}
              >
                <Layers className="w-3.5 h-3.5 mr-2" />
                Positions ({positions.length})
              </button>
              <button 
                onClick={() => setBottomTab("orders")}
                className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center ${
                  bottomTab === "orders" 
                    ? "border-emerald-400 text-emerald-400 bg-[rgba(255,255,255,0.02)]" 
                    : "border-transparent text-[#a1a1aa] hover:text-[#f4f4f7]"
                }`}
              >
                <History className="w-3.5 h-3.5 mr-2" />
                Open Orders ({openOrders.length})
              </button>
              <button 
                onClick={() => setBottomTab("fills")}
                className={`px-5 py-3 text-sm font-semibold border-b-2 transition flex items-center ${
                  bottomTab === "fills" 
                    ? "border-emerald-400 text-emerald-400 bg-[rgba(255,255,255,0.02)]" 
                    : "border-transparent text-[#a1a1aa] hover:text-[#f4f4f7]"
                }`}
              >
                <History className="w-3.5 h-3.5 mr-2" />
                Historical Fills ({fills.length})
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
              {bottomTab === "positions" && (
                <div className="h-full">
                  {positions.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[#a1a1aa] border-b border-[rgba(255,255,255,0.04)] pb-2">
                          <th className="py-2">Market</th>
                          <th className="py-2">Side</th>
                          <th className="py-2">Size</th>
                          <th className="py-2">Entry Price</th>
                          <th className="py-2">Liq. Price</th>
                          <th className="py-2">PnL</th>
                          <th className="py-2">Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map((p, idx) => (
                          <tr key={idx} className="border-b border-[rgba(255,255,255,0.02)] py-2">
                            <td className="py-3 font-bold">{p.market}</td>
                            <td className="py-3">
                              <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[10px] ${
                                p.side === "long" ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"
                              }`}>
                                {p.side}
                              </span>
                            </td>
                            <td className="py-3 font-bold">{p.qty} SOL</td>
                            <td className="py-3">${p.averagePrice.toFixed(2)}</td>
                            <td className="py-3 text-orange-400">${p.liquidationPrice.toFixed(2)}</td>
                            <td className={`py-3 font-bold ${p.realisedPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {p.realisedPnL >= 0 ? "+" : ""}{p.realisedPnL.toFixed(2)} USD
                            </td>
                            <td className="py-3">${p.margin} ({p.leverage}x)</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="h-full flex items-center justify-center text-[#a1a1aa]">
                      No open perpetual positions.
                    </div>
                  )}
                </div>
              )}

              {bottomTab === "orders" && (
                <div className="h-full">
                  {openOrders.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[#a1a1aa] border-b border-[rgba(255,255,255,0.04)] pb-2">
                          <th className="py-2">Side</th>
                          <th className="py-2">Type</th>
                          <th className="py-2">Price</th>
                          <th className="py-2">Qty</th>
                          <th className="py-2">Filled</th>
                          <th className="py-2">Margin</th>
                          <th className="py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openOrders.map((o) => (
                          <tr key={o.orderId} className="border-b border-[rgba(255,255,255,0.02)] py-2">
                            <td className="py-3">
                              <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[10px] ${
                                o.side === "buy" ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"
                              }`}>
                                {o.side}
                              </span>
                            </td>
                            <td className="py-3 uppercase">{o.type}</td>
                            <td className="py-3">${o.price.toFixed(2)}</td>
                            <td className="py-3">{o.qty}</td>
                            <td className="py-3">{o.filledQty}</td>
                            <td className="py-3">${o.margin}</td>
                            <td className="py-3 text-right">
                              <button 
                                onClick={() => handleCancelOrder(o.orderId)}
                                className="px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold tracking-tight transition"
                              >
                                Cancel
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="h-full flex items-center justify-center text-[#a1a1aa]">
                      No active resting limit orders.
                    </div>
                  )}
                </div>
              )}

              {bottomTab === "fills" && (
                <div className="h-full">
                  {fills.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[#a1a1aa] border-b border-[rgba(255,255,255,0.04)] pb-2">
                          <th className="py-2">Fill ID</th>
                          <th className="py-2">Price</th>
                          <th className="py-2">Qty</th>
                          <th className="py-2">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fills.map((f) => (
                          <tr key={f.fillId} className="border-b border-[rgba(255,255,255,0.02)] py-2">
                            <td className="py-3 max-w-[120px] truncate">{f.fillId}</td>
                            <td className="py-3 font-bold">${f.price.toFixed(2)}</td>
                            <td className="py-3">{f.qty} SOL</td>
                            <td className="py-3 text-[#a1a1aa]">
                              {new Date(f.createdAt).toLocaleTimeString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="h-full flex items-center justify-center text-[#a1a1aa]">
                      No execution logs found.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ORDERBOOK, RECENT TRADES, & TERMINAL (Right panel) */}
        <div className="flex flex-col md:grid md:grid-cols-2 lg:flex lg:flex-col gap-3 h-full overflow-hidden">
          {/* Orderbook and Recent Trades */}
          <div className="flex-1 bg-[rgba(12,12,16,0.65)] border border-[rgba(255,255,255,0.06)] rounded-xl flex flex-col overflow-hidden min-h-[300px]">
            <div className="grid grid-cols-2 h-full">
              {/* Orderbook */}
              <div className="border-r border-[rgba(255,255,255,0.06)] flex flex-col h-full overflow-hidden">
                <div className="px-3 py-2 border-b border-[rgba(255,255,255,0.06)] text-xs font-bold bg-[rgba(255,255,255,0.02)]">
                  Live Orderbook
                </div>
                <div className="flex-1 overflow-y-auto p-2 font-mono text-[10px] flex flex-col justify-between">
                  {/* Asks (Sell Orders - Top) */}
                  <div className="flex-1 flex flex-col justify-end">
                    {asks.slice(0, 10).reverse().map((ask, i) => {
                      const percentage = (ask.qty / orderbookTotalQty) * 100;
                      return (
                        <div key={i} className="relative py-0.5 flex justify-between px-1">
                          <div className="absolute top-0 right-0 bottom-0 depth-glow-red transition-all duration-300" style={{ width: `${percentage}%` }} />
                          <span className="text-red-400 font-bold z-10">{ask.price.toFixed(2)}</span>
                          <span className="text-[#f4f4f7] z-10">{ask.qty.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Spreadsheet Price Divider */}
                  <div className="py-2 border-y border-[rgba(255,255,255,0.04)] my-1 text-center font-bold text-sm bg-[rgba(255,255,255,0.01)]">
                    <span className={tickerPrice >= prevTickerPrice ? "text-emerald-400" : "text-red-400"}>
                      {tickerPrice.toFixed(2)}
                    </span>
                  </div>

                  {/* Bids (Buy Orders - Bottom) */}
                  <div className="flex-1">
                    {bids.slice(0, 10).map((bid, i) => {
                      const percentage = (bid.qty / orderbookTotalQty) * 100;
                      return (
                        <div key={i} className="relative py-0.5 flex justify-between px-1">
                          <div className="absolute top-0 left-0 bottom-0 depth-glow-green transition-all duration-300" style={{ width: `${percentage}%` }} />
                          <span className="text-emerald-400 font-bold z-10">{bid.price.toFixed(2)}</span>
                          <span className="text-[#f4f4f7] z-10">{bid.qty.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Recent Trades */}
              <div className="flex flex-col h-full overflow-hidden">
                <div className="px-3 py-2 border-b border-[rgba(255,255,255,0.06)] text-xs font-bold bg-[rgba(255,255,255,0.02)]">
                  Market Trades
                </div>
                <div className="flex-1 overflow-y-auto p-2 font-mono text-[10px] space-y-1">
                  {recentTrades.slice(0, 20).map((trade, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-emerald-400 font-bold">{trade.price.toFixed(2)}</span>
                      <span>{trade.qty.toFixed(2)}</span>
                      <span className="text-[#a1a1aa]">{new Date(trade.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Trade Execution Terminal */}
          <div className="bg-[rgba(12,12,16,0.65)] border border-[rgba(255,255,255,0.06)] rounded-xl p-4 flex flex-col justify-between">
            <div>
              {/* Wallet Info */}
              <div className="flex items-center justify-between text-xs pb-3 border-b border-[rgba(255,255,255,0.06)] mb-4">
                <span className="text-[#a1a1aa]">Available:</span>
                <span className="font-bold font-mono text-emerald-400">
                  ${usdBalance.available.toLocaleString()} USD
                </span>
              </div>

              {/* Side Selector B/S */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => setOrderSide("buy")}
                  className={`py-2 rounded-lg font-bold text-sm tracking-wide transition ${
                    orderSide === "buy"
                      ? "bg-emerald-500 text-[#08080a]"
                      : "bg-[rgba(255,255,255,0.03)] text-[#a1a1aa] hover:text-[#f4f4f7]"
                  }`}
                >
                  Buy / Long
                </button>
                <button
                  onClick={() => setOrderSide("sell")}
                  className={`py-2 rounded-lg font-bold text-sm tracking-wide transition ${
                    orderSide === "sell"
                      ? "bg-red-500 text-[#f4f4f7]"
                      : "bg-[rgba(255,255,255,0.03)] text-[#a1a1aa] hover:text-[#f4f4f7]"
                  }`}
                >
                  Sell / Short
                </button>
              </div>

              {/* Type Selector L/M */}
              <div className="grid grid-cols-2 gap-2 mb-4 bg-[rgba(0,0,0,0.25)] p-1 rounded-lg">
                <button
                  onClick={() => setOrderType("limit")}
                  className={`py-1.5 rounded-md text-xs font-semibold transition ${
                    orderType === "limit"
                      ? "bg-[rgba(255,255,255,0.06)] text-[#f4f4f7]"
                      : "text-[#a1a1aa] hover:text-[#f4f4f7]"
                  }`}
                >
                  Limit
                </button>
                <button
                  onClick={() => setOrderType("market")}
                  className={`py-1.5 rounded-md text-xs font-semibold transition ${
                    orderType === "market"
                      ? "bg-[rgba(255,255,255,0.06)] text-[#f4f4f7]"
                      : "text-[#a1a1aa] hover:text-[#f4f4f7]"
                  }`}
                >
                  Market
                </button>
              </div>

              {/* Price / Qty Inputs */}
              <form onSubmit={handlePlaceOrder} className="space-y-4">
                {orderType === "limit" && (
                  <div>
                    <label className="text-[10px] text-[#a1a1aa] uppercase font-bold tracking-wider mb-1.5 block">Price (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={orderPrice}
                      onChange={(e) => setOrderPrice(e.target.value)}
                      className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm font-mono focus:border-emerald-400 focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[10px] text-[#a1a1aa] uppercase font-bold tracking-wider mb-1.5 block">Quantity (SOL)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={orderQty}
                    onChange={(e) => setOrderQty(e.target.value)}
                    className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm font-mono focus:border-emerald-400 focus:outline-none"
                  />
                </div>

                {/* Leverage Slider */}
                <div>
                  <div className="flex justify-between text-[10px] uppercase font-bold tracking-wider text-[#a1a1aa] mb-1.5">
                    <span>Leverage</span>
                    <span className="text-emerald-400">{leverage}x</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={leverage}
                    onChange={(e) => setLeverage(parseInt(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>

                {/* Feedback Logs */}
                {orderError && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded-lg font-mono">
                    {orderError}
                  </div>
                )}
                {orderSuccess && (
                  <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg font-mono">
                    {orderSuccess}
                  </div>
                )}

                {/* Confirm Button */}
                <button
                  type="submit"
                  className={`w-full py-3 rounded-xl font-bold text-sm tracking-wider transition ${
                    orderSide === "buy"
                      ? "bg-emerald-500 hover:bg-emerald-400 text-[#08080a] shadow-[0_4px_16px_rgba(16,185,129,0.2)]"
                      : "bg-red-500 hover:bg-red-400 text-[#f4f4f7] shadow-[0_4px_16px_rgba(239,68,68,0.2)]"
                  }`}
                >
                  Confirm {orderSide === "buy" ? "Long" : "Short"}
                </button>
              </form>
            </div>

            {/* Estimated Margin Info */}
            <div className="pt-4 mt-4 border-t border-[rgba(255,255,255,0.04)] text-center text-xs text-[#a1a1aa]">
              Required Margin: <span className="font-bold text-[#f4f4f7] font-mono">${calculatedMargin} USD</span>
            </div>
          </div>
        </div>
      </main>

      {/* AUTH POPUP */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c0c10] border border-[rgba(255,255,255,0.08)] rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
            <button 
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-[#a1a1aa] hover:text-[#f4f4f7] transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold tracking-tight mb-6 flex items-center">
              <Play className="w-5 h-5 text-emerald-400 mr-2" />
              {authMode === "signup" ? "Create Trading Profile" : "Connect Profile"}
            </h2>

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === "signup" && (
                <div>
                  <label className="text-[10px] text-[#a1a1aa] uppercase font-bold tracking-wider block mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                    placeholder="Trader Joe"
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] text-[#a1a1aa] uppercase font-bold tracking-wider block mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  placeholder="trader@test.com"
                />
              </div>

              <div>
                <label className="text-[10px] text-[#a1a1aa] uppercase font-bold tracking-wider block mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 mt-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 text-[#08080a] font-bold text-sm transition shadow-lg"
              >
                {authMode === "signup" ? "Initialize Profile" : "Sign In"}
              </button>

              {orderError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded-lg font-mono mt-3">
                  {orderError}
                </div>
              )}
            </form>

            <div className="mt-4 text-center text-xs text-[#a1a1aa]">
              {authMode === "signup" ? (
                <span>
                  Already have a profile?{" "}
                  <button onClick={() => setAuthMode("signin")} className="text-emerald-400 hover:underline font-bold">
                    Connect Profile
                  </button>
                </span>
              ) : (
                <span>
                  New to Perps Turbo?{" "}
                  <button onClick={() => setAuthMode("signup")} className="text-emerald-400 hover:underline font-bold">
                    Create Profile
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DEPOSIT FUNDS POPUP */}
      {showOnrampModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0c0c10] border border-[rgba(255,255,255,0.08)] rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
            <button 
              onClick={() => setShowOnrampModal(false)}
              className="absolute top-4 right-4 text-[#a1a1aa] hover:text-[#f4f4f7] transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold tracking-tight mb-6 flex items-center">
              <Wallet className="w-5 h-5 text-emerald-400 mr-2" />
              Deposit Mock USD
            </h2>

            <form onSubmit={handleOnramp} className="space-y-4">
              <div>
                <label className="text-[10px] text-[#a1a1aa] uppercase font-bold tracking-wider block mb-1">Amount (USD)</label>
                <input
                  type="number"
                  required
                  value={onrampAmount}
                  onChange={(e) => setOnrampAmount(e.target.value)}
                  className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none font-mono"
                  placeholder="5000"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 text-[#08080a] font-bold text-sm transition shadow-lg"
              >
                Deposit Funds
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


