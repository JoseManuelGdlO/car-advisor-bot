import { Router } from "express";
import { requireUserAuth } from "../middlewares/auth.js";
import { getDashboard, getTopProducts } from "../controllers/dashboardController.js";

export const dashboardRoutes = Router();

dashboardRoutes.get("/dashboard/kpis", requireUserAuth, getDashboard);
dashboardRoutes.get("/dashboard/top-products", requireUserAuth, getTopProducts);
