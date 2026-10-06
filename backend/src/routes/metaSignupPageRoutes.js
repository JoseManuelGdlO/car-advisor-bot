import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  getWhatsappSignupPage,
  postWhatsappSignupCancel,
  postWhatsappSignupComplete,
} from "../controllers/metaSignupPageController.js";

export const metaSignupPageRoutes = Router();

const pageLimit = rateLimit({ windowMs: 60_000, limit: 30 });
const actionLimit = rateLimit({ windowMs: 60_000, limit: 10 });

metaSignupPageRoutes.get("/whatsapp-signup", pageLimit, getWhatsappSignupPage);
metaSignupPageRoutes.post("/whatsapp-signup/complete", actionLimit, postWhatsappSignupComplete);
metaSignupPageRoutes.post("/whatsapp-signup/cancel", actionLimit, postWhatsappSignupCancel);
