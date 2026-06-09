import prisma from "@perps-turbo-repo/db";

const BASE_URL = "http://127.0.0.1:3000";
const SIMULATION_DURATION_MS = 30000; // Run simulation for 30 seconds
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

  console.log(`[Simulation] Setting up ${count} traders...`);

  for (let i = 0; i < count; i++) {
    const email = `trader-${i}-${Date.now()}@test.com`;
    const password = "securepassword123";
    const name = `Trader ${i}`;

    try {
      console.log(`[Simulation] [Trader ${i}] Sending signup request...`);
      // 1. Sign Up
      const signupRes = await fetch(`${BASE_URL}/api/user/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password })
      });
      console.log(`[Simulation] [Trader ${i}] Signup request response status: ${signupRes.status}`);

      if (!signupRes.ok) {
        throw new Error(`Sign up failed: ${await signupRes.text()}`);
      }

      console.log(`[Simulation] [Trader ${i}] Sending signin request...`);
      // 2. Sign In
      const signinRes = await fetch(`${BASE_URL}/api/user/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      console.log(`[Simulation] [Trader ${i}] Signin request response status: ${signinRes.status}`);

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
        body: JSON.stringify({ userId: user.id, amount: 500000, symbol: "USD" })
      });

      if (!onrampRes.ok) {
        throw new Error(`Funding failed: ${await onrampRes.text()}`);
      }

      console.log(`[Simulation] Funded & Activated Trader: ${email}`);

      traders.push({
        email,
        token,
        userId: user.id,
        activeOrders: []
      });
    } catch (err) {
      console.error(`[Simulation] Error setting up trader-${i}:`, err);
    }
  }

  return traders;
}

async function runTraderLoop(trader: Trader, stopSignal: { stop: boolean }) {
  let midPrice = 100;

  while (!stopSignal.stop) {
    try {
      // Randomly adjust mid-price slightly to simulate market moves
      midPrice += (Math.random() - 0.5) * 0.5;

      const choice = Math.random();

      if (choice < 0.4) {
        // 1. Submit Buy Limit Order (40% chance)
        const price = parseFloat((midPrice - Math.random() * 2).toFixed(2));
        const qty = parseFloat((1 + Math.random() * 9).toFixed(2));
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
            sllipage: 1
          })
        });

        if (orderRes.ok) {
          const { response } = (await orderRes.json()) as any;
          if (response?.orderId) {
            trader.activeOrders.push(response.orderId);
            console.log(`[Limit Buy] Trader ${trader.email} placed order @ $${price} (Qty: ${qty})`);
          }
        }
      } else if (choice < 0.8) {
        // 2. Submit Sell Limit Order (40% chance)
        const price = parseFloat((midPrice + Math.random() * 2).toFixed(2));
        const qty = parseFloat((1 + Math.random() * 9).toFixed(2));
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
            sllipage: 1
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
        // 3. Submit Market Order (10% chance) - Creates matches and fills
        const side = Math.random() > 0.5 ? "buy" : "sell";
        const qty = parseFloat((1 + Math.random() * 5).toFixed(2));
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
            sllipage: 5
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
      console.error(`[Simulation Loop Error] Trader ${trader.email}:`, err);
    }

    // Sleep between 50ms and 200ms to simulate high frequency
    await delay(50 + Math.random() * 150);
  }
}

async function printDatabaseStats() {
  console.log("\n[Simulation] Querying database stats from PostgreSQL...");
  try {
    const totalOrders = await prisma.order.count();
    const openOrders = await prisma.order.count({ where: { Status: "open" } });
    const filledOrders = await prisma.order.count({ where: { Status: "filled" } });
    const partiallyFilledOrders = await prisma.order.count({ where: { Status: "partially_filled" } });
    const cancelledOrders = await prisma.order.count({ where: { Status: "cancelled" } });
    const totalFills = await prisma.fill.count();

    console.log("-----------------------------------------------");
    console.log(`Total Orders in Database: ${totalOrders}`);
    console.log(`  - Open:             ${openOrders}`);
    console.log(`  - Filled:           ${filledOrders}`);
    console.log(`  - Partially Filled: ${partiallyFilledOrders}`);
    console.log(`  - Cancelled:        ${cancelledOrders}`);
    console.log(`Total Fills in Database:  ${totalFills}`);
    console.log("-----------------------------------------------");
  } catch (err) {
    console.error("[Simulation] Failed to query database stats:", err);
  }
}

async function run() {
  console.log("=================================================");
  console.log("Starting High-Frequency Trading (HFT) Simulator  ");
  console.log("=================================================");

  // Setup 5 traders
  const traders = await registerAndLoginTraders(5);
  if (traders.length === 0) {
    console.error("[Simulation] Failed to set up any traders. Exiting.");
    process.exit(1);
  }

  const stopSignal = { stop: false };

  console.log(`\n[Simulation] Starting HFT loops. Simulation will run for ${SIMULATION_DURATION_MS / 1000}s...`);

  // Start trader loops in parallel
  const loops = traders.map((t) => runTraderLoop(t, stopSignal));

  // Wait for the duration
  await delay(SIMULATION_DURATION_MS);

  console.log("\n[Simulation] Stopping simulator...");
  stopSignal.stop = true;

  // Wait for all loops to settle
  await Promise.all(loops);
  console.log("[Simulation] All trader loops stopped.");

  // Wait 2 seconds for db-puller to finish catching up on stream writes
  console.log("[Simulation] Waiting 2 seconds for DB Sync catch-up...");
  await delay(2000);

  // Print Postgres stats
  await printDatabaseStats();

  console.log("\nSimulation Completed Successfully!");
  process.exit(0);
}

run().catch((err) => {
  console.error("Simulation run error:", err);
  process.exit(1);
});
