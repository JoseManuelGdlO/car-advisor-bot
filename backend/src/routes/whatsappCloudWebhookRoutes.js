import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getMetaWhatsappWebhook, postMetaWhatsappWebhook } from "../controllers/whatsappCloudWebhookController.js";
import { verifyMetaSignature } from "../middlewares/verifyMetaSignature.js";

export const whatsappCloudWebhookRoutes = Router();

const webhookLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
});

whatsappCloudWebhookRoutes.get("/webhooks/meta/whatsapp", webhookLimiter, getMetaWhatsappWebhook);

whatsappCloudWebhookRoutes.post("/webhooks/meta/whatsapp", webhookLimiter, verifyMetaSignature, postMetaWhatsappWebhook);
