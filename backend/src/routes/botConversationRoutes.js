import { Router } from "express";
import { requireServiceToken } from "../middlewares/auth.js";
import { botUpsertConversation } from "../controllers/botConversationController.js";

export const botConversationRoutes = Router();

botConversationRoutes.post("/bot/conversation-events", requireServiceToken, botUpsertConversation);
