import { Router } from "express";
import { requireServiceToken, requireUserAuth } from "../middlewares/auth.js";
import {
  botUpsertConversation,
  createClient,
  createFaq,
  createPromotion,
  createVehicle,
  deleteFaq,
  getClient,
  getConversationMessages,
  getDashboard,
  listClients,
  listConversations,
  listFaqs,
  listPromotions,
  listVehicles,
  togglePromotion,
  updateFaq,
} from "../controllers/crmController.js";

export const crmRoutes = Router();

crmRoutes.get("/dashboard/kpis", requireUserAuth, getDashboard);
crmRoutes.get("/clients", requireUserAuth, listClients);
crmRoutes.post("/clients", requireUserAuth, createClient);
crmRoutes.get("/clients/:id", requireUserAuth, getClient);

crmRoutes.get("/conversations", requireUserAuth, listConversations);
crmRoutes.get("/conversations/:id/messages", requireUserAuth, getConversationMessages);

crmRoutes.get("/vehicles", requireUserAuth, listVehicles);
crmRoutes.post("/vehicles", requireUserAuth, createVehicle);

crmRoutes.get("/faqs", requireUserAuth, listFaqs);
crmRoutes.post("/faqs", requireUserAuth, createFaq);
crmRoutes.patch("/faqs/:id", requireUserAuth, updateFaq);
crmRoutes.delete("/faqs/:id", requireUserAuth, deleteFaq);

crmRoutes.get("/promotions", requireUserAuth, listPromotions);
crmRoutes.post("/promotions", requireUserAuth, createPromotion);
crmRoutes.post("/promotions/:id/toggle", requireUserAuth, togglePromotion);

crmRoutes.post("/bot/conversation-events", requireServiceToken, botUpsertConversation);
