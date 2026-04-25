import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { apiRoutes } from "./routes/apiRoutes.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";

export const app = express();
const normalizeOrigin = (value) => String(value || "").trim().replace(/\/$/, "").toLowerCase();
const allowedOrigins = new Set(env.corsOrigins.map((item) => normalizeOrigin(item)).filter(Boolean));
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(
  cors({
    origin(origin, cb) {
      const normalizedOrigin = normalizeOrigin(origin);
      const isLocalDevOrigin =
        typeof normalizedOrigin === "string" &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalizedOrigin);
      if (!origin || allowedOrigins.has(normalizedOrigin) || isLocalDevOrigin) {
        return cb(null, true);
      }
      console.warn(`[cors] blocked origin: ${origin}`);
      // Do not throw here: throwing causes preflight to return 500.
      return cb(null, false);
    },
    credentials: true,
    optionsSuccessStatus: 204,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use("/uploads/autobot", express.static(path.resolve(process.cwd(), "autobot")));
app.use(morgan("dev"));
app.use(`${env.apiPrefix}`, apiRoutes);
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use(notFoundHandler);
app.use(errorHandler);
