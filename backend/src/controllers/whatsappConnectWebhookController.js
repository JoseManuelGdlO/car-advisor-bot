import { ApiError } from "../utils/errors.js";
import { env } from "../config/env.js";
import {
  resolveWhatsappConnectIntegrationByDevice,
} from "../services/integrationResolverService.js";
import { routeWhatsappConnectWebhookEvent } from "../services/conversationRoutingService.js";

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
    if (!deviceId) throw new ApiError(400, "Missing deviceId for webhook routing");

    const resolved = await resolveWhatsappConnectIntegrationByDevice({ deviceId });
    req.wc = { ...req.wc, ...resolved };
    return next();
  } catch (error) {
    return next(error);
  }
};

export const postWhatsappConnectEvents = async (req, res, next) => {
  try {
    // Punto de entrada E2E: normaliza, deduplica, persiste, llama bot y responde.
    if (!env.wc.webhookEnabled) throw new ApiError(503, "Webhook disabled");
    const result = await routeWhatsappConnectWebhookEvent({
      payload: req.wc.payload,
      integration: req.wc.integration,
      credentials: req.wc.credentials,
    });
    return res.status(202).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return res.status(409).json({ ok: false, message: "duplicate_event" });
    }
    return next(error);
  }
};
