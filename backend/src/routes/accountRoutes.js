import { Router } from "express";
import { requireUserAuth } from "../middlewares/auth.js";
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
  getWhatsappMetaStatus,
  postMetaDisconnect,
  postMetaEmbeddedSignup,
} from "../controllers/metaWhatsappController.js";

export const accountRoutes = Router();

accountRoutes.get("/account/profile", requireUserAuth, getAccountProfile);
accountRoutes.patch("/account/profile", requireUserAuth, patchAccountProfile);
accountRoutes.get("/account/notification-preferences", requireUserAuth, getNotificationPreferences);
accountRoutes.patch("/account/notification-preferences", requireUserAuth, patchNotificationPreferences);
accountRoutes.delete("/account", requireUserAuth, deleteAccount);

accountRoutes.get("/integrations", requireUserAuth, listIntegrations);
accountRoutes.post("/integrations", requireUserAuth, createIntegration);
accountRoutes.patch("/integrations/:id", requireUserAuth, patchIntegration);
accountRoutes.delete("/integrations/:id", requireUserAuth, deleteIntegration);
accountRoutes.post("/integrations/:id/credentials", requireUserAuth, postIntegrationCredentials);
accountRoutes.post("/integrations/:id/test", requireUserAuth, postIntegrationTest);

accountRoutes.get("/integrations/whatsapp/meta/config", requireUserAuth, getMetaSignupConfig);
accountRoutes.post("/integrations/whatsapp/meta/signup", requireUserAuth, postMetaEmbeddedSignup);
accountRoutes.post("/integrations/whatsapp/meta/disconnect", requireUserAuth, postMetaDisconnect);
accountRoutes.get("/internal/whatsapp/meta/status", requireUserAuth, getWhatsappMetaStatus);
