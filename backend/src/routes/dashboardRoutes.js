import { Router } from "express";
import { requireUserAuth } from "../middlewares/auth.js";
import { getDashboard } from "../controllers/dashboardController.js";

export const dashboardRoutes = Router();

dashboardRoutes.get("/dashboard/kpis", requireUserAuth, getDashboard);
