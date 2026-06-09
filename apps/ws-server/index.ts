import { client, connectionRedis } from "@repo/redis";

const PORT = 3002;

// Map of room name -> Set of socket connections
const rooms = new Map<string, Set<any>>();

// Quick lookup: socket -> Set of rooms it is subscribed to
const socketSubscriptions = new Map<any, Set<string>>();

async function startWebSocketServer() {
  await connectionRedis();

  const subClient = client.duplicate();
  await subClient.connect();

  console.log("[WS Server] Connected to Redis.");

  // Subscribe to all matching engine and db-puller pubsub updates
  await subClient.pSubscribe("pubsub:*", (message, channel) => {
    // Strip "pubsub:" prefix to get the room name (e.g. "orderbook:SOL_USD_PERP")
    const room = channel.slice(7);
    const subscribers = rooms.get(room);

    if (subscribers && subscribers.size > 0) {
      const payload = JSON.stringify({ room, data: JSON.parse(message) });
      for (const ws of subscribers) {
        ws.send(payload);
      }
    }
  });

  console.log("[WS Server] Subscribed to Redis PubSub pattern: pubsub:*");

  Bun.serve({
    port: PORT,
    websocket: {
      open(_ws: any) {
        console.log(`[WS Server] Client connected`);
      },
      message(ws: any, message: any) {
        try {
          const parsed = JSON.parse(message.toString());
          const { action, room } = parsed;

          if (!action || !room) {
            ws.send(JSON.stringify({ error: "Invalid protocol. Expected { action, room }" }));
            return;
          }

          if (action === "subscribe") {
            if (!rooms.has(room)) {
              rooms.set(room, new Set());
            }
            rooms.get(room)!.add(ws);

            if (!socketSubscriptions.has(ws)) {
              socketSubscriptions.set(ws, new Set());
            }
            socketSubscriptions.get(ws)!.add(room);

            ws.send(JSON.stringify({ status: "subscribed", room }));
            console.log(`[WS Server] Client subscribed to room: ${room}`);

          } else if (action === "unsubscribe") {
            const roomSet = rooms.get(room);
            if (roomSet) {
              roomSet.delete(ws);
            }
            const wsRooms = socketSubscriptions.get(ws);
            if (wsRooms) {
              wsRooms.delete(room);
            }
            ws.send(JSON.stringify({ status: "unsubscribed", room }));
            console.log(`[WS Server] Client unsubscribed from room: ${room}`);
          }
        } catch (err) {
          ws.send(JSON.stringify({ error: "Failed to process message" }));
        }
      },
      close(ws: any) {
        console.log("[WS Server] Client disconnected");
        const wsRooms = socketSubscriptions.get(ws);
        if (wsRooms) {
          for (const room of wsRooms) {
            const roomSet = rooms.get(room);
            if (roomSet) {
              roomSet.delete(ws);
            }
          }
          socketSubscriptions.delete(ws);
        }
      }
    },
    fetch(req: Request, server: any) {
      if (server.upgrade(req)) {
        return;
      }
      return new Response("WebSocket server is running.", { status: 200 });
    }
  });

  console.log(`[WS Server] WebSocket Server is listening on ws://localhost:${PORT}`);
}

startWebSocketServer().catch(console.error);
