import { Router } from "express";
import { createServiceToken, listServiceTokens, login, register, revokeServiceToken } from "../controllers/authController.js";
import { requireUserAuth } from "../middlewares/auth.js";

export const authRoutes = Router();
authRoutes.post("/register", register);
authRoutes.post("/login", login);
authRoutes.get("/service-tokens", requireUserAuth, listServiceTokens);
authRoutes.post("/service-tokens", requireUserAuth, createServiceToken);
authRoutes.post("/service-tokens/:id/revoke", requireUserAuth, revokeServiceToken);
