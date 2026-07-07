import { Router } from "express";
import {
  createServiceToken,
  forgotPassword,
  listServiceTokens,
  login,
  register,
  resetPassword,
  revokeServiceToken,
} from "../controllers/authController.js";
import { requireUserAuth } from "../middlewares/auth.js";

export const authRoutes = Router();
authRoutes.post("/register", register);
authRoutes.post("/login", login);
authRoutes.post("/forgot-password", forgotPassword);
authRoutes.post("/reset-password", resetPassword);
authRoutes.get("/service-tokens", requireUserAuth, listServiceTokens);
authRoutes.post("/service-tokens", requireUserAuth, createServiceToken);
authRoutes.post("/service-tokens/:id/revoke", requireUserAuth, revokeServiceToken);
