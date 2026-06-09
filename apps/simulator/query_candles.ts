import prisma from "@perps-turbo-repo/db";

async function main() {
  const candles = await prisma.candle.findMany();
  console.log("Total candles in database:", candles.length);
  for (const c of candles) {
    console.log(`- ID: ${c.id}, Symbol: ${c.symbol}, Time: ${c.timestamp.toISOString()}, Open: ${c.open}, Close: ${c.close}, Volume: ${c.volume}`);
  }
}

main().catch(console.error);
