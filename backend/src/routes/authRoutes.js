import { Router } from "express";
import { createServiceToken, login, register, revokeServiceToken } from "../controllers/authController.js";
import { requireUserAuth } from "../middlewares/auth.js";

export const authRoutes = Router();
authRoutes.post("/register", register);
authRoutes.post("/login", login);
authRoutes.post("/service-tokens", requireUserAuth, createServiceToken);
authRoutes.post("/service-tokens/:id/revoke", requireUserAuth, revokeServiceToken);
