import { Router } from "express";
import { requireUserAuth } from "../middlewares/auth.js";
import {
  getMetaSignupConfig,
  getWhatsappMetaStatus,
  postMetaDisconnect,
  postMetaEmbeddedSignup,
  postMetaWhatsappSendTest,
} from "../controllers/metaWhatsappController.js";

export const metaWhatsappRoutes = Router();

metaWhatsappRoutes.get("/integrations/whatsapp/meta/config", requireUserAuth, getMetaSignupConfig);
metaWhatsappRoutes.post("/integrations/whatsapp/meta/signup", requireUserAuth, postMetaEmbeddedSignup);
metaWhatsappRoutes.post("/integrations/whatsapp/meta/disconnect", requireUserAuth, postMetaDisconnect);
metaWhatsappRoutes.get("/internal/whatsapp/meta/status", requireUserAuth, getWhatsappMetaStatus);
metaWhatsappRoutes.post("/internal/whatsapp/send-test", requireUserAuth, postMetaWhatsappSendTest);
