import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { apiRoutes } from "./routes/apiRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";

export const app = express();
// EasyPanel/Nginx agrega X-Forwarded-*; habilitar trust proxy evita falsos positivos en rate-limit.
app.set("trust proxy", 1);
// Normaliza origins para comparar sin importar slash final/mayúsculas.
const normalizeOrigin = (value) => String(value || "").trim().replace(/\/$/, "").toLowerCase();
const allowedOrigins = new Set(env.corsOrigins.map((item) => normalizeOrigin(item)).filter(Boolean));
// Capa base de hardening HTTP (headers de seguridad).
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
// CORS con allowlist explícita + excepción localhost en desarrollo.
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
app.use(
  express.json({
    limit: "1mb",
    // Conserva el payload crudo para validar firmas HMAC en webhooks.
    verify(req, _res, buf) {
      req.rawBody = buf?.toString("utf8") || "";
    },
  })
);
// Activos estáticos para recursos del bot/autobot.
app.use("/uploads/autobot", express.static(path.resolve(process.cwd(), "autobot")));
app.use(morgan("dev"));
// Throttling de rutas de autenticación para reducir brute force.
const authRateLimit = rateLimit({ windowMs: 60_000, limit: 30 });
// Soporta prefijo custom de API, manteniendo compatibilidad con /api.
const normalizedApiPrefix = (() => {
  const value = String(env.apiPrefix || "").trim();
  if (!value) return "/api";
  return value.startsWith("/") ? value : `/${value}`;
})();
app.use("/api/auth", authRateLimit, authRoutes);
app.use("/auth", authRateLimit, authRoutes);
app.use("/api", apiRoutes);
if (normalizedApiPrefix !== "/api") {
  app.use(normalizedApiPrefix, apiRoutes);
}
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use(notFoundHandler);
app.use(errorHandler);
