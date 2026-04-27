import { ApiError } from "../utils/errors.js";
import { env } from "../config/env.js";
import {
  resolveWhatsappConnectIntegrationByDevice,
} from "../services/integrationResolverService.js";
import { routeWhatsappConnectWebhookEvent } from "../services/conversationRoutingService.js";
import { logWcWebhook, logWcWebhookDebug } from "../utils/wcWebhookLog.js";

const safeParseBody = (req) => {
  // Admite body parseado o buffer crudo para soportar validación de firma.
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8").trim() : String(req.rawBody || "").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, "Invalid JSON payload");
  }
};

export const resolveWhatsappWebhookIntegration = async (req, _res, next) => {
  try {
    // Resuelve tenant/integración usando deviceId del evento entrante.
    const payload = safeParseBody(req);
    req.wc = { ...(req.wc || {}), payload };

    const deviceId = String(payload?.deviceId || payload?.device?.id || payload?.data?.deviceId || "").trim();
    const eventId = String(payload?.eventId || payload?.id || "").trim();
    const eventType = String(payload?.type || payload?.event || "").trim();
    if (!deviceId) throw new ApiError(400, "Missing deviceId for webhook routing");

    const resolved = await resolveWhatsappConnectIntegrationByDevice({ deviceId });
    req.wc = { ...req.wc, ...resolved };
    logWcWebhook("routed", {
      eventId: eventId || null,
      eventType: eventType || null,
      deviceId,
      integrationId: resolved.integration?.id,
      ownerUserId: resolved.integration?.ownerUserId,
    });
    logWcWebhookDebug("payload summary", {
      hasNormalized: Boolean(payload?.normalized),
      normalizedFrom: payload?.normalized?.from ? String(payload.normalized.from).slice(0, 64) : null,
      bodyBytes: typeof req.rawBody === "string" ? req.rawBody.length : null,
    });
    return next();
  } catch (error) {
    return next(error);
  }
};

export const postWhatsappConnectEvents = async (req, res, next) => {
  const providerEventId = String(req.wc?.payload?.eventId || req.wc?.payload?.id || "").trim();
  try {
    // Punto de entrada E2E: normaliza, deduplica, persiste, llama bot y responde.
    if (!env.wc.webhookEnabled) throw new ApiError(503, "Webhook disabled");
    logWcWebhook("ingest start", {
      providerEventId: providerEventId || null,
      integrationId: req.wc?.integration?.id,
    });
    const result = await routeWhatsappConnectWebhookEvent({
      payload: req.wc.payload,
      integration: req.wc.integration,
      credentials: req.wc.credentials,
    });
    logWcWebhook("ingest ok", {
      providerEventId: providerEventId || null,
      ...result,
    });
    return res.status(202).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      // Reintentos del worker de WC: el recibo ya existía; 2xx evita DLQ / ruido en logs del proveedor.
      logWcWebhook("ingest duplicate (idempotent)", {
        providerEventId: providerEventId || null,
        integrationId: req.wc?.integration?.id,
      });
      return res.status(202).json({ ok: true, duplicate: true, message: "duplicate_event" });
    }
    logWcWebhook("ingest error", {
      providerEventId: providerEventId || null,
      integrationId: req.wc?.integration?.id,
      status: error?.status,
      name: error?.name,
      message: error?.message || String(error),
    });
    logWcWebhookDebug("ingest error detail", {
      stack: error?.stack,
    });
    return next(error);
  }
};
