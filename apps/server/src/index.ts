import { env } from "@perps-turbo-repo/env/server";
import cors from "cors";
import express from "express";
import { engineRouter } from "./routes/engine.routes";
import { userRouter } from "./routes/user.routes";
import { middleware } from "./middleware";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
  }),
);

app.use(express.json());

app.use("/api/user",userRouter);
app.use("/api/engine",middleware, engineRouter);

app.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
