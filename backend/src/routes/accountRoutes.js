import { Router } from "express";
import { requireUserAuth } from "../middlewares/auth.js";
import { getAccountProfile, patchAccountProfile } from "../controllers/accountController.js";
import {
  createIntegration,
  listIntegrations,
  patchIntegration,
  postIntegrationCredentials,
  postIntegrationTest,
} from "../controllers/integrationsController.js";

export const accountRoutes = Router();

accountRoutes.get("/account/profile", requireUserAuth, getAccountProfile);
accountRoutes.patch("/account/profile", requireUserAuth, patchAccountProfile);

accountRoutes.get("/integrations", requireUserAuth, listIntegrations);
accountRoutes.post("/integrations", requireUserAuth, createIntegration);
accountRoutes.patch("/integrations/:id", requireUserAuth, patchIntegration);
accountRoutes.post("/integrations/:id/credentials", requireUserAuth, postIntegrationCredentials);
accountRoutes.post("/integrations/:id/test", requireUserAuth, postIntegrationTest);
