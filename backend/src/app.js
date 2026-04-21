import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { authRoutes } from "./routes/authRoutes.js";
import { crmRoutes } from "./routes/crmRoutes.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";

export const app = express();
app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.use(`${env.apiPrefix}/auth`, rateLimit({ windowMs: 60_000, limit: 30 }), authRoutes);
app.use(`${env.apiPrefix}`, crmRoutes);
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use(notFoundHandler);
app.use(errorHandler);
