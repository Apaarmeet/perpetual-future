import prisma from "@perps-turbo-repo/db";

const BASE_URL = process.env.API_URL || "http://127.0.0.1:3000";
const SYMBOL = "SOL_USD_PERP";

interface Trader {
  email: string;
  token: string;
  userId: string;
  activeOrders: string[];
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function registerAndLoginTraders(count: number): Promise<Trader[]> {
  const traders: Trader[] = [];

  console.log(`[Simulator] Setting up ${count} traders...`);

  for (let i = 0; i < count; i++) {
    const email = `sim-trader-${i}-${Date.now()}@test.com`;
    const password = "securepassword123";
    const name = `Sim Trader ${i}`;

    try {
      console.log(`[Simulator] [Trader ${i}] Sending signup request...`);
      // 1. Sign Up
      const signupRes = await fetch(`${BASE_URL}/api/user/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password })
      });
      console.log(`[Simulator] [Trader ${i}] Signup request response status: ${signupRes.status}`);

      if (!signupRes.ok) {
        throw new Error(`Sign up failed: ${await signupRes.text()}`);
      }

      console.log(`[Simulator] [Trader ${i}] Sending signin request...`);
      // 2. Sign In
      const signinRes = await fetch(`${BASE_URL}/api/user/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      console.log(`[Simulator] [Trader ${i}] Signin request response status: ${signinRes.status}`);

      if (!signinRes.ok) {
        throw new Error(`Sign in failed: ${await signinRes.text()}`);
      }

      const { token, user } = (await signinRes.json()) as any;

      // 3. Fund Account (On-ramp)
      const onrampRes = await fetch(`${BASE_URL}/api/engine/onramp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token
        },
        body: JSON.stringify({ userId: user.id, amount: 5000000, symbol: "USD" })
      });

      if (!onrampRes.ok) {
        throw new Error(`Funding failed: ${await onrampRes.text()}`);
      }

      console.log(`[Simulator] Funded & Activated Trader: ${email}`);

      traders.push({
        email,
        token,
        userId: user.id,
        activeOrders: []
      });
    } catch (err) {
      console.error(`[Simulator] Error setting up trader-${i}:`, err);
    }
  }

  return traders;
}
let globalMidPrice = 100;

async function startPriceTracker() {
  console.log("[Simulator] Fetching initial SOL price from Binance...");
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT");
    if (res.ok) {
      const data = await res.json() as any;
      if (data.price) {
        globalMidPrice = parseFloat(data.price);
        console.log(`[Simulator] Initialized price tracker at $${globalMidPrice}`);
      }
    }
  } catch (err) {
    console.error("[Simulator] Failed to fetch initial price from Binance, defaulting to 100");
  }

  while (true) {
    try {
      const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT");
      if (res.ok) {
        const data = await res.json() as any;
        if (data.price) {
          globalMidPrice = parseFloat(data.price);
        }
      }
    } catch (err) {
      globalMidPrice += (Math.random() - 0.5) * 0.1;
    }
    await delay(3000);
  }
}

async function runTraderLoop(trader: Trader) {
  while (true) {
    try {
      const midPrice = globalMidPrice;

      const choice = Math.random();

      if (choice < 0.25) {
        // 1. Submit Buy Limit Order (25% chance) — tight spread to encourage crossing
        const price = parseFloat((midPrice - Math.random() * 0.5).toFixed(2)); // within 0-0.5 of mid
        const qty = parseFloat((1 + Math.random() * 4).toFixed(2));
        const margin = parseFloat((price * qty * 0.1).toFixed(2)); // 10x leverage

        const orderRes = await fetch(`${BASE_URL}/api/engine/order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": trader.token
          },
          body: JSON.stringify({
            userId: trader.userId,
            type: "limit",
            side: "buy",
            symbol: SYMBOL,
            price,
            qty,
            margin,
            sllipage: 2
          })
        });

        if (orderRes.ok) {
          const { response } = (await orderRes.json()) as any;
          if (response?.orderId) {
            trader.activeOrders.push(response.orderId);
            console.log(`[Limit Buy] Trader ${trader.email} placed order @ $${price} (Qty: ${qty})`);
          }
        }
      } else if (choice < 0.5) {
        // 2. Submit Sell Limit Order (25% chance) — tight spread to encourage crossing
        const price = parseFloat((midPrice + Math.random() * 0.5).toFixed(2)); // within 0-0.5 of mid
        const qty = parseFloat((1 + Math.random() * 4).toFixed(2));
        const margin = parseFloat((price * qty * 0.1).toFixed(2)); // 10x leverage

        const orderRes = await fetch(`${BASE_URL}/api/engine/order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": trader.token
          },
          body: JSON.stringify({
            userId: trader.userId,
            type: "limit",
            side: "sell",
            symbol: SYMBOL,
            price,
            qty,
            margin,
            sllipage: 2
          })
        });

        if (orderRes.ok) {
          const { response } = (await orderRes.json()) as any;
          if (response?.orderId) {
            trader.activeOrders.push(response.orderId);
            console.log(`[Limit Sell] Trader ${trader.email} placed order @ $${price} (Qty: ${qty})`);
          }
        }
      } else if (choice < 0.9) {
        // 3. Submit Market Order (40% chance) — high frequency to generate fills!
        const side = Math.random() > 0.5 ? "buy" : "sell";
        const qty = parseFloat((1 + Math.random() * 3).toFixed(2));
        const estimatePrice = midPrice;
        const margin = parseFloat((estimatePrice * qty * 0.1).toFixed(2)); // 10x leverage

        console.log(`[Market Order] Trader ${trader.email} submitting ${side.toUpperCase()} market order...`);

        await fetch(`${BASE_URL}/api/engine/order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": trader.token
          },
          body: JSON.stringify({
            userId: trader.userId,
            type: "market",
            side,
            symbol: SYMBOL,
            qty,
            margin,
            sllipage: 10  // high slippage = definitely crosses the spread
          })
        });
      } else {
        // 4. Cancel a random active order (10% chance)
        if (trader.activeOrders.length > 0) {
          const index = Math.floor(Math.random() * trader.activeOrders.length);
          const orderId = trader.activeOrders[index];

          const cancelRes = await fetch(`${BASE_URL}/api/engine/order`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              "Authorization": trader.token
            },
            body: JSON.stringify({ userId: trader.userId, orderId })
          });

          if (cancelRes.ok) {
            trader.activeOrders.splice(index, 1);
            console.log(`[Cancel Order] Trader ${trader.email} cancelled order ${orderId}`);
          }
        }
      }
    } catch (err) {
      console.error(`[Simulator Loop Error] Trader ${trader.email}:`, err);
    }

    // Sleep between 800ms and 2000ms — slow down so database puller can keep up with remote Neon DB latency
    await delay(800 + Math.random() * 1200);
  }
}

async function startStatsPrinter() {
  while (true) {
    await delay(15000); // print stats every 15s
    console.log("\n[Simulator Stats] Querying database stats from PostgreSQL...");
    try {
      const totalOrders = await prisma.order.count();
      const openOrders = await prisma.order.count({ where: { Status: "open" } });
      const filledOrders = await prisma.order.count({ where: { Status: "filled" } });
      const partiallyFilledOrders = await prisma.order.count({ where: { Status: "partially_filled" } });
      const cancelledOrders = await prisma.order.count({ where: { Status: "cancelled" } });
      const totalFills = await prisma.fill.count();
      const candleCount = await prisma.candle.count();

      console.log("-----------------------------------------------");
      console.log(`Total Orders in Database: ${totalOrders}`);
      console.log(`  - Open:             ${openOrders}`);
      console.log(`  - Filled:           ${filledOrders}`);
      console.log(`  - Partially Filled: ${partiallyFilledOrders}`);
      console.log(`  - Cancelled:        ${cancelledOrders}`);
      console.log(`Total Fills in Database:  ${totalFills}`);
      console.log(`Total Candles in Database: ${candleCount}`);
      console.log("-----------------------------------------------");
    } catch (err) {
      console.error("[Simulator Stats] Failed to query database stats:", err);
    }
  }
}

async function run() {
  console.log("=================================================");
  console.log("Starting Continuous HFT Simulator                ");
  console.log("=================================================");

  // Setup 5 traders
  const traders = await registerAndLoginTraders(5);
  if (traders.length === 0) {
    console.error("[Simulator] Failed to set up any traders. Exiting.");
    process.exit(1);
  }

  console.log(`\n[Simulator] Starting continuous HFT loops.`);

  // Start price tracker loop in background to keep globalMidPrice updated
  startPriceTracker().catch((err) => console.error("Price tracker loop failed:", err));

  // Start stats printing loop in background
  startStatsPrinter().catch((err) => console.error("Stats printing loop failed:", err));

  // Start trader loops in parallel (they loop forever)
  await Promise.all(traders.map((t) => runTraderLoop(t)));
}

run().catch((err) => {
  console.error("Simulator execution error:", err);
  process.exit(1);
});
