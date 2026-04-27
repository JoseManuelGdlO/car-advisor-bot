import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  postWhatsappConnectEvents,
  resolveWhatsappWebhookIntegration,
} from "../controllers/whatsappConnectWebhookController.js";
import { antiReplayWindow } from "../middlewares/antiReplayWindow.js";
import { verifyWcSignature } from "../middlewares/verifyWcSignature.js";
import { env } from "../config/env.js";

export const whatsappConnectWebhookRoutes = Router();

const webhookLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
});

// Endpoint público inbound de proveedor con hardening de seguridad.
whatsappConnectWebhookRoutes.post(
  "/webhooks/whatsapp-connect/events",
  express.raw({ type: "application/json", limit: "1mb" }),
  webhookLimiter,
  resolveWhatsappWebhookIntegration,
  verifyWcSignature,
  antiReplayWindow({ maxSkewMs: env.wc.webhookMaxSkewMs }),
  postWhatsappConnectEvents
);
