import { Router } from "express";
import { requireAdmin, requireAdminOrService, requireUserAuth, requireUserOrServiceAuth } from "../middlewares/auth.js";
import { getBotSettings, upsertBotSettings } from "../controllers/botSettingsController.js";

export const botSettingsRoutes = Router();

botSettingsRoutes.get("/bot/settings", requireUserOrServiceAuth, requireAdminOrService, getBotSettings);
botSettingsRoutes.patch("/bot/settings", requireUserAuth, requireAdmin, upsertBotSettings);
