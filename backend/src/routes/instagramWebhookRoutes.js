import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getMetaInstagramWebhook, postMetaInstagramWebhook } from "../controllers/instagramWebhookController.js";
import { verifyMetaInstagramSignature } from "../middlewares/verifyMetaSignature.js";

export const instagramWebhookRoutes = Router();

const webhookLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
});

instagramWebhookRoutes.get("/webhooks/meta/instagram", webhookLimiter, getMetaInstagramWebhook);

instagramWebhookRoutes.post("/webhooks/meta/instagram", webhookLimiter, verifyMetaInstagramSignature, postMetaInstagramWebhook);
