import { Router } from "express";
import { botSettingsRoutes } from "./botSettingsRoutes.js";
import { botConversationRoutes } from "./botConversationRoutes.js";

export const botRoutes = Router();

botRoutes.use("/", botSettingsRoutes);
botRoutes.use("/", botConversationRoutes);
