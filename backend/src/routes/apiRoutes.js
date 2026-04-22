import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authRoutes } from "./authRoutes.js";
import { coreRoutes } from "./coreRoutes.js";
import { catalogRoutes } from "./catalogRoutes.js";
import { contentRoutes } from "./contentRoutes.js";
import { botRoutes } from "./botRoutes.js";
import { financingRoutes } from "./financingRoutes.js";
import { accountRoutes } from "./accountRoutes.js";

export const apiRoutes = Router();

apiRoutes.use("/auth", rateLimit({ windowMs: 60_000, limit: 30 }), authRoutes);
apiRoutes.use("/", coreRoutes);
apiRoutes.use("/", catalogRoutes);
apiRoutes.use("/", contentRoutes);
apiRoutes.use("/", botRoutes);
apiRoutes.use("/", financingRoutes);
apiRoutes.use("/", accountRoutes);
