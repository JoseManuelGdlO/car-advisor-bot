import { Router } from "express";
import { requireServiceToken, requireUserOrServiceAuth } from "../middlewares/auth.js";
import { botResetConversation, botSetConversationControl, botUpsertConversation } from "../controllers/botConversationController.js";
import { botPushNotify } from "../controllers/pushController.js";

export const botConversationRoutes = Router();

botConversationRoutes.post("/bot/conversation-events", requireServiceToken, botUpsertConversation);
botConversationRoutes.patch("/bot/conversations/:conversationId/control", requireServiceToken, botSetConversationControl );
botConversationRoutes.post("/bot/push-notify", requireServiceToken, botPushNotify);
botConversationRoutes.post("/bot/reset-conversation", requireUserOrServiceAuth, botResetConversation);
