import { Router } from "express";
import { requireUserAuth, requireUserOrServiceAuth } from "../middlewares/auth.js";
import { getBotSettings, upsertBotSettings } from "../controllers/botSettingsController.js";

export const botSettingsRoutes = Router();

botSettingsRoutes.get("/bot/settings", requireUserOrServiceAuth, getBotSettings);
botSettingsRoutes.patch("/bot/settings", requireUserAuth, upsertBotSettings);
