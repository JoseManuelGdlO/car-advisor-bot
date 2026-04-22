import { Router } from "express";
import { requireUserAuth } from "../middlewares/auth.js";
import { getConversationMessages, listConversations } from "../controllers/conversationsController.js";

export const conversationsRoutes = Router();

conversationsRoutes.get("/conversations", requireUserAuth, listConversations);
conversationsRoutes.get("/conversations/:id/messages", requireUserAuth, getConversationMessages);
