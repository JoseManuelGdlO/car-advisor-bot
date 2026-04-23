import { Router } from "express";
import { requireServiceToken, requireUserOrServiceAuth } from "../middlewares/auth.js";
import { botResetConversation, botUpsertConversation } from "../controllers/botConversationController.js";

export const botConversationRoutes = Router();

botConversationRoutes.post("/bot/conversation-events", requireServiceToken, botUpsertConversation);
botConversationRoutes.post("/bot/reset-conversation", requireUserOrServiceAuth, botResetConversation);
