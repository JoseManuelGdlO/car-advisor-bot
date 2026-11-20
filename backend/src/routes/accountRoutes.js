import { Router } from "express";
import { requireAdmin, requireUserAuth } from "../middlewares/auth.js";
import {
  deleteAccount,
  getAccountProfile,
  getNotificationPreferences,
  patchAccountProfile,
  patchNotificationPreferences,
} from "../controllers/accountController.js";
import {
  createIntegration,
  deleteIntegration,
  listIntegrations,
  patchIntegration,
  postIntegrationCredentials,
  postIntegrationTest,
} from "../controllers/integrationsController.js";
import {
  getMetaSignupConfig,
  getMetaSignupTicket,
  getWhatsappMetaStatus,
  postMetaDisconnect,
  postMetaEmbeddedSignup,
  postMetaSignupTicket,
  postMetaWhatsappSendTest,
} from "../controllers/metaWhatsappController.js";
import {
  getFollowupTemplateHandler,
  postFollowupTemplateHandler,
  putFollowupTemplateHandler,
} from "../controllers/whatsappFollowupTemplateController.js";

export const accountRoutes = Router();

accountRoutes.get("/account/profile", requireUserAuth, getAccountProfile);
accountRoutes.patch("/account/profile", requireUserAuth, patchAccountProfile);
accountRoutes.get("/account/notification-preferences", requireUserAuth, getNotificationPreferences);
accountRoutes.patch("/account/notification-preferences", requireUserAuth, patchNotificationPreferences);
accountRoutes.delete("/account", requireUserAuth, requireAdmin, deleteAccount);

accountRoutes.get("/integrations", requireUserAuth, requireAdmin, listIntegrations);
accountRoutes.post("/integrations", requireUserAuth, requireAdmin, createIntegration);
accountRoutes.patch("/integrations/:id", requireUserAuth, requireAdmin, patchIntegration);
accountRoutes.delete("/integrations/:id", requireUserAuth, requireAdmin, deleteIntegration);
accountRoutes.post("/integrations/:id/credentials", requireUserAuth, requireAdmin, postIntegrationCredentials);
accountRoutes.post("/integrations/:id/test", requireUserAuth, requireAdmin, postIntegrationTest);

accountRoutes.get("/integrations/whatsapp/meta/config", requireUserAuth, requireAdmin, getMetaSignupConfig);
accountRoutes.post("/integrations/whatsapp/meta/signup-ticket", requireUserAuth, requireAdmin, postMetaSignupTicket);
accountRoutes.get("/integrations/whatsapp/meta/signup-ticket", requireUserAuth, requireAdmin, getMetaSignupTicket);
accountRoutes.post("/integrations/whatsapp/meta/signup", requireUserAuth, requireAdmin, postMetaEmbeddedSignup);
accountRoutes.post("/integrations/whatsapp/meta/disconnect", requireUserAuth, requireAdmin, postMetaDisconnect);
accountRoutes.get(
  "/integrations/whatsapp/meta/templates/followup",
  requireUserAuth,
  requireAdmin,
  getFollowupTemplateHandler
);
accountRoutes.post(
  "/integrations/whatsapp/meta/templates/followup",
  requireUserAuth,
  requireAdmin,
  postFollowupTemplateHandler
);
accountRoutes.put(
  "/integrations/whatsapp/meta/templates/followup",
  requireUserAuth,
  requireAdmin,
  putFollowupTemplateHandler
);
accountRoutes.get("/internal/whatsapp/meta/status", requireUserAuth, requireAdmin, getWhatsappMetaStatus);
accountRoutes.post("/internal/whatsapp/send-test", requireUserAuth, requireAdmin, postMetaWhatsappSendTest);
