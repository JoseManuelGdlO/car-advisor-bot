import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import {
  expandWhatsappCloudInboundMessages,
  toNormalizedWhatsappCloudEvent,
} from "../services/whatsappCloudEventNormalizer.js";
import { ingestWhatsappCloudEvent } from "../services/whatsappCloudWebhookIngestionService.js";
import { resolveMetaWhatsappByPhoneNumberId } from "../services/integrationResolverService.js";

const quietTest = process.env.NODE_ENV === "test";

const logWaCloud = (message, meta = {}) => {
  if (quietTest) return;
  const keys = Object.keys(meta || {});
  const tail = keys
    .map((k) => {
      const val = meta[k];
      const primitive =
        typeof val === "string" || typeof val === "number" || typeof val === "boolean";
      return `${k}=${primitive ? String(val) : JSON.stringify(val)}`;
    })
    .join(" ");
  console.log(tail ? `[wa-cloud] ${message} ${tail}` : `[wa-cloud] ${message}`);
};

const logWaCloudDebug = (message, meta = {}) => {
  if (env.logLevel !== "debug" || !env.meta.webhookDebug) return;
  logWaCloud(message, meta);
};

export const getMetaWhatsappWebhook = (req, res) => {
  const mode = String(req.query["hub.mode"] || "");
  const token = String(req.query["hub.verify_token"] || "");
  const challenge = req.query["hub.challenge"];
  const expected = String(env.meta.webhookVerifyToken || "").trim();
  if (!expected) {
    return res.status(503).send("verify token not configured");
  }
  if (mode === "subscribe" && token === expected && challenge != null && challenge !== "") {
    return res.status(200).send(String(challenge));
  }
  return res.sendStatus(403);
};

export const postMetaWhatsappWebhook = async (req, res, next) => {
  try {
    if (!env.meta.webhookEnabled) throw new ApiError(503, "WhatsApp Cloud webhook disabled");
    const body = req.body && typeof req.body === "object" ? req.body : {};
    logWaCloudDebug("payload object", { object: body.object });

    const expanded = expandWhatsappCloudInboundMessages(body);
    if (expanded.length === 0) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const cache = new Map();
    const results = [];

    for (const event of expanded) {
      const phoneNumberId = String(event.phoneNumberId || "").trim();
      if (!phoneNumberId) {
        logWaCloud("ingest miss (missing phone_number_id)", { messageId: event.messageId });
        results.push({ ok: true, ignored: true, reason: "missing_phone_number_id" });
        continue;
      }

      let resolved = cache.get(phoneNumberId);
      if (resolved === undefined) {
        try {
          resolved = await resolveMetaWhatsappByPhoneNumberId({ phoneNumberId });
        } catch (error) {
          if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
            logWaCloud("ingest miss (unknown phone_number_id)", { phoneNumberId });
            resolved = null;
          } else {
            throw error;
          }
        }
        cache.set(phoneNumberId, resolved);
      }
      if (!resolved) {
        results.push({ ok: true, ignored: true, reason: "unknown_phone_number_id" });
        continue;
      }

      const normalized = toNormalizedWhatsappCloudEvent({
        integration: resolved.integration,
        credentials: resolved.credentials,
        event,
      });
      logWaCloud("ingest start", {
        providerEventId: normalized.eventId,
        integrationId: normalized.integrationId,
      });
      try {
        const result = await ingestWhatsappCloudEvent({
          normalizedEvent: normalized,
          credentials: resolved.credentials,
        });
        logWaCloud("ingest ok", { providerEventId: normalized.eventId, ...result });
        results.push(result);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          logWaCloud("ingest duplicate (idempotent)", { providerEventId: normalized.eventId });
          results.push({ ok: true, duplicate: true });
          continue;
        }
        throw error;
      }
    }

    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (error) {
    logWaCloud("ingest error", {
      message: error?.message || String(error),
      status: error?.status,
    });
    return next(error);
  }
};
