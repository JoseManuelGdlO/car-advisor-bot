import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import { expandInstagramWebhookInboundMessages, toNormalizedInstagramInboundEvent } from "../services/instagramEventNormalizer.js";
import { ingestInstagramMetaEvent } from "../services/instagramWebhookIngestionService.js";
import { resolveInstagramMetaIntegrationByBusinessAccountId } from "../services/integrationResolverService.js";
import { logIgWebhook, logIgWebhookDebug } from "../utils/instagramWebhookLog.js";

export const getMetaInstagramWebhook = (req, res) => {
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

export const postMetaInstagramWebhook = async (req, res, next) => {
  try {
    if (!env.meta.webhookEnabled) throw new ApiError(503, "Instagram webhook disabled");
    const body = req.body && typeof req.body === "object" ? req.body : {};
    logIgWebhookDebug("payload object", { object: body.object });

    const expanded = expandInstagramWebhookInboundMessages(body);
    if (expanded.length === 0) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const cache = new Map();
    const results = [];

    for (const event of expanded) {
      const bizId = event.instagramBusinessAccountId;
      let resolved = cache.get(bizId);
      if (!resolved) {
        resolved = await resolveInstagramMetaIntegrationByBusinessAccountId({
          instagramBusinessAccountId: bizId,
        });
        cache.set(bizId, resolved);
      }
      const normalized = toNormalizedInstagramInboundEvent({
        integration: resolved.integration,
        credentials: resolved.credentials,
        event,
      });
      logIgWebhook("ingest start", {
        providerEventId: normalized.eventId,
        integrationId: normalized.integrationId,
      });
      try {
        const result = await ingestInstagramMetaEvent({
          normalizedEvent: normalized,
          credentials: resolved.credentials,
        });
        logIgWebhook("ingest ok", { providerEventId: normalized.eventId, ...result });
        results.push(result);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          logIgWebhook("ingest duplicate (idempotent)", { providerEventId: normalized.eventId });
          results.push({ ok: true, duplicate: true });
          continue;
        }
        throw error;
      }
    }

    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (error) {
    logIgWebhook("ingest error", {
      message: error?.message || String(error),
      status: error?.status,
    });
    return next(error);
  }
};
