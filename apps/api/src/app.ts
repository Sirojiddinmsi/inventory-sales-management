import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { resolve } from "node:path";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { query } from "./config/database.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import { apiRouter } from "./routes/index.js";
import { asyncHandler } from "./shared/async-handler.js";

export const app = express();

app.set("trust proxy", 1);
app.use(pinoHttp());
app.use(helmet());
app.use(
  cors({
    origin:
      env.CORS_ORIGIN.trim() === "*"
        ? true
        : env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true
  })
);
app.use(compression());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false }));
app.use("/uploads", express.static(resolve(process.cwd(), "uploads")));
app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false
  })
);

app.get(
  "/health",
  asyncHandler(async (_req, res) => {
    await query("SELECT 1");
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  })
);

app.use("/api/v1", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
