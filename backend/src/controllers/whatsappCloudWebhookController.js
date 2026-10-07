import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import {
  expandWhatsappCloudInboundMessages,
  toNormalizedWhatsappCloudEvent,
} from "../services/whatsappCloudEventNormalizer.js";
import { ingestWhatsappCloudEvent as defaultIngestWhatsappCloudEvent } from "../services/whatsappCloudWebhookIngestionService.js";
import { resolveMetaWhatsappByPhoneNumberId as defaultResolveMetaWhatsappByPhoneNumberId } from "../services/integrationResolverService.js";
import { applyTemplateStatusUpdate as defaultApplyTemplateStatusUpdate } from "../services/whatsappFollowupTemplateService.js";

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

export function extractTemplateStatusUpdates(body = {}) {
  const entries = Array.isArray(body.entry) ? body.entry : [];
  const out = [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (change?.field !== "message_template_status_update") continue;
      const value = change?.value && typeof change.value === "object" ? change.value : {};
      out.push({
        wabaId: String(entry?.id || "").trim(),
        metaTemplateId: String(value.message_template_id || "").trim() || null,
        name: String(value.message_template_name || "").trim(),
        language: String(value.message_template_language || "").trim(),
        event: String(value.event || "").trim().toUpperCase(),
        reason: value.reason == null ? null : String(value.reason),
      });
    }
  }
  return out;
}

export async function handleMetaWhatsappWebhookBody(
  body,
  {
    applyTemplateStatusUpdate: applyStatus = defaultApplyTemplateStatusUpdate,
    ingestWhatsappCloudEvent: ingestEvent = defaultIngestWhatsappCloudEvent,
    resolveMetaWhatsappByPhoneNumberId: resolveByPhone = defaultResolveMetaWhatsappByPhoneNumberId,
  } = {}
) {
  const templateUpdates = extractTemplateStatusUpdates(body);
  const expanded = expandWhatsappCloudInboundMessages(body);
  if (templateUpdates.length === 0 && expanded.length === 0) {
    return { ok: true, ignored: true };
  }

  const templateResults = [];
  for (const update of templateUpdates) {
    try {
      templateResults.push(await applyStatus(update));
    } catch (error) {
      logWaCloud("template status isolated", {
        wabaId: update.wabaId,
        name: update.name,
        message: error?.message || String(error),
      });
      templateResults.push({
        ok: false,
        isolated: true,
        error: error?.message || "template status failed",
      });
    }
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

    try {
      let resolved = cache.get(phoneNumberId);
      if (resolved === undefined) {
        try {
          resolved = await resolveByPhone({ phoneNumberId });
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
        const result = await ingestEvent({
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
        logWaCloud("ingest isolated", {
          providerEventId: normalized.eventId,
          message: error?.message || String(error),
        });
        results.push({
          ok: false,
          isolated: true,
          error: error?.message || "ingest failed",
        });
      }
    } catch (error) {
      logWaCloud("ingest isolated", {
        messageId: event.messageId,
        phoneNumberId,
        message: error?.message || String(error),
      });
      results.push({
        ok: false,
        isolated: true,
        error: error?.message || "ingest failed",
      });
    }
  }

  return {
    ok: true,
    processed: results.length,
    templateUpdates: templateResults.length,
    results,
  };
}

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

export const postMetaWhatsappWebhook = async (req, res, next, deps = {}) => {
  try {
    if (!env.meta.webhookEnabled) throw new ApiError(503, "WhatsApp Cloud webhook disabled");
    const body = req.body && typeof req.body === "object" ? req.body : {};
    logWaCloudDebug("payload object", { object: body.object });
    const payload = await handleMetaWhatsappWebhookBody(body, deps);
    return res.status(200).json(payload);
  } catch (error) {
    logWaCloud("ingest error", {
      message: error?.message || String(error),
      status: error?.status,
    });
    return next(error);
  }
};
