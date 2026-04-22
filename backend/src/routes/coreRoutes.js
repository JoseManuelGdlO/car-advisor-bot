import { Router } from "express";
import { dashboardRoutes } from "./dashboardRoutes.js";
import { clientsRoutes } from "./clientsRoutes.js";
import { conversationsRoutes } from "./conversationsRoutes.js";

export const coreRoutes = Router();

coreRoutes.use("/", dashboardRoutes);
coreRoutes.use("/", clientsRoutes);
coreRoutes.use("/", conversationsRoutes);
