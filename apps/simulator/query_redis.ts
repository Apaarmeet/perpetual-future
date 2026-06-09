import { createClient } from "redis";
import { env } from "@perps-turbo-repo/env/server";

async function main() {
  const client = createClient({ url: env.REDIS_URL });
  await client.connect();
  console.log("Connected to Redis at", env.REDIS_URL);

  try {
    const dbEventsLen = await client.xLen("db:events");
    console.log("Length of 'db:events' stream:", dbEventsLen);

    const engineReqLen = await client.xLen("engine:request");
    console.log("Length of 'engine:request' stream:", engineReqLen);

    // Get info of db:events
    const info = await client.xInfoStream("db:events") as any;
    console.log("db:events info:");
    console.log(`- Length: ${info.length}`);
    console.log(`- First entry ID: ${info.firstEntry?.[0]}`);
    console.log(`- Last entry ID: ${info.lastEntry?.[0]}`);
  } catch (err: any) {
    console.error("Error querying Redis:", err.message);
  } finally {
    await client.quit();
  }
}

main().catch(console.error);
