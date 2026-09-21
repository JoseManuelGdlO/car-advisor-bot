import { normalizeDisplayPhone } from "../utils/whatsappIdentity.js";

const WHATSAPP_CLOUD_OBJECT = "whatsapp_business_account";
const UNSUPPORTED_MEDIA_TYPES = new Set(["image", "audio", "document", "video", "sticker", "voice"]);

const asTrimmed = (value) => String(value ?? "").trim();

const asNullableString = (value) => {
  const text = asTrimmed(value);
  return text || null;
};

const asGraphUserId = (value) => asTrimmed(value).replace(/@s\.whatsapp\.net$/i, "").trim();

const toTimestampMs = (value) => {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) return Date.now();
  return ts < 1e12 ? ts * 1000 : ts;
};

const readMessageText = (message) => {
  const type = asTrimmed(message?.type).toLowerCase();
  const fromText = asTrimmed(message?.text?.body);
  if (fromText) return fromText;
  const fromButton = asTrimmed(message?.button?.text || message?.button?.payload);
  if (fromButton) return fromButton;
  const reply = message?.interactive?.button_reply || message?.interactive?.list_reply;
  const fromInteractive = asTrimmed(reply?.title || reply?.id);
  if (fromInteractive) return fromInteractive;
  const caption = asTrimmed(
    message?.image?.caption || message?.document?.caption || message?.video?.caption
  );
  if (caption) return caption;
  if (type === "text") return "";
  return "";
};

const adContextFromReferral = (referral) => {
  if (!referral || typeof referral !== "object") return null;
  return {
    isAd: true,
    title: asNullableString(referral.headline),
    body: asNullableString(referral.body),
    sourceId: asNullableString(referral.source_id),
    sourceUrl: asNullableString(referral.source_url),
    sourceApp: asNullableString(referral.source_app),
    ctwaClid: asNullableString(referral.ctwa_clid),
    mediaUrl: asNullableString(referral.image_url || referral.video_url || referral.thumbnail_url),
    greetingMessageBody: asNullableString(referral.welcome_message?.text),
  };
};

/**
 * Expande el webhook `object: "whatsapp_business_account"` en mensajes inbound.
 * Los `statuses` (acks) no producen eventos inbound en fase 1.
 * @param {object} body
 * @returns {Array<{
 *   phoneNumberId: string;
 *   wabaId: string;
 *   from: string;
 *   messageId: string;
 *   text: string;
 *   timestampMs: number;
 *   unsupportedMediaOnly: boolean;
 *   adContext: null | object;
 * }>}
 */
export const expandWhatsappCloudInboundMessages = (body) => {
  if (!body || typeof body !== "object") return [];
  if (String(body.object || "").toLowerCase() !== WHATSAPP_CLOUD_OBJECT) return [];

  const out = [];
  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    const wabaId = asTrimmed(entry?.id);
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value && typeof change.value === "object" ? change.value : {};
      const phoneNumberId = asTrimmed(value.metadata?.phone_number_id);
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of messages) {
        const messageId = asTrimmed(message?.id);
        const from = asGraphUserId(message?.from);
        if (!messageId || !from) continue;

        const text = readMessageText(message);
        const type = asTrimmed(message?.type).toLowerCase();
        const unsupportedMediaOnly = !text && UNSUPPORTED_MEDIA_TYPES.has(type);
        if (!text && !unsupportedMediaOnly) continue;

        out.push({
          phoneNumberId,
          wabaId,
          from,
          messageId,
          text,
          timestampMs: toTimestampMs(message?.timestamp),
          unsupportedMediaOnly,
          adContext: adContextFromReferral(message?.referral),
        });
      }
    }
  }
  return out;
};

export const toNormalizedWhatsappCloudEvent = ({ integration, credentials, event }) => {
  const externalUserId = asGraphUserId(event.from);
  const displayPhone = normalizeDisplayPhone(externalUserId) || externalUserId;
  const deviceId = asTrimmed(credentials?.phoneNumberId || integration?.phoneNumberId);
  return {
    provider: "meta",
    channel: "whatsapp",
    integrationId: integration.id,
    ownerUserId: integration.ownerUserId,
    externalUserId,
    displayPhone,
    deviceId,
    tenantId: null,
    eventId: event.messageId,
    messageId: event.messageId,
    occurredAt: new Date(event.timestampMs).toISOString(),
    direction: "inbound",
    eventType: "whatsapp.messaging",
    text: event.text,
    unsupportedMediaOnly: Boolean(event.unsupportedMediaOnly),
    adContext: event.adContext || null,
    isInboundMessage: true,
  };
};
