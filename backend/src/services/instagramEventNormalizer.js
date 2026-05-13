/**
 * Expande el webhook `object: "instagram"` en eventos canónicos listos para ingesta.
 * @param {object} body
 * @returns {Array<{
 *   instagramBusinessAccountId: string;
 *   senderId: string;
 *   messageId: string;
 *   text: string;
 *   timestampMs: number;
 *   unsupportedMediaOnly?: boolean;
 * }>}
 */
export const expandInstagramWebhookInboundMessages = (body) => {
  if (!body || typeof body !== "object") return [];
  if (String(body.object || "").toLowerCase() !== "instagram") return [];

  const out = [];
  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    const instagramBusinessAccountId = String(entry?.id || "").trim();
    if (!instagramBusinessAccountId) continue;
    const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
    for (const item of messaging) {
      if (item?.message?.is_echo) continue;
      const mid = String(item?.message?.mid || "").trim();
      if (!mid) continue;
      const senderId = String(item?.sender?.id || "").trim();
      if (!senderId) continue;
      const text = String(item?.message?.text || "").trim();
      const attachments = Array.isArray(item?.message?.attachments) ? item.message.attachments : [];
      const hasAttachments = attachments.length > 0;
      const ts = Number(item?.timestamp);
      const timestampMs = Number.isFinite(ts) && ts > 0 ? (ts < 1e12 ? ts * 1000 : ts) : Date.now();

      if (text) {
        out.push({
          instagramBusinessAccountId,
          senderId,
          messageId: mid,
          text,
          timestampMs,
          unsupportedMediaOnly: false,
        });
        continue;
      }
      if (hasAttachments) {
        out.push({
          instagramBusinessAccountId,
          senderId,
          messageId: mid,
          text: "",
          timestampMs,
          unsupportedMediaOnly: true,
        });
      }
    }
  }
  return out;
};

export const toNormalizedInstagramInboundEvent = ({ integration, credentials, event }) => {
  const eventId = event.messageId;
  const externalUserId = event.senderId;
  const pageId = credentials.pageId;
  return {
    provider: "meta-instagram",
    channel: "instagram",
    integrationId: integration.id,
    ownerUserId: integration.ownerUserId,
    externalUserId,
    tenantId: null,
    /** Convención: `device_id` en contexto = Page ID de Meta para envíos salientes. */
    deviceId: pageId,
    instagramBusinessAccountId: event.instagramBusinessAccountId,
    eventId,
    messageId: event.messageId,
    occurredAt: new Date(event.timestampMs).toISOString(),
    direction: "inbound",
    eventType: "instagram.messaging",
    text: event.text,
    unsupportedMediaOnly: Boolean(event.unsupportedMediaOnly),
    isInboundMessage: true,
  };
};
