import { ApiError } from "../utils/errors.js";
import { normalizeDisplayPhone, resolveDisplayPhone } from "../utils/whatsappIdentity.js";

const toIsoOrNow = (value) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
};

const asNullableString = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const readText = (payload) =>
  String(
    payload?.normalized?.content?.text ||
      payload?.message?.text ||
      payload?.data?.message?.text ||
      payload?.text ||
      payload?.body?.text ||
      ""
  ).trim();

const readDeviceId = (payload) => String(payload?.deviceId || payload?.device?.id || payload?.data?.deviceId || "").trim();

const readEventType = (payload) => String(payload?.event || payload?.eventType || payload?.type || "").trim().toLowerCase();

const readMedia = (payload) =>
  payload?.normalized?.content?.media ??
  payload?.message?.media ??
  payload?.data?.message?.media ??
  null;

const mediaHasContent = (media) => {
  if (media == null) return false;
  if (Array.isArray(media)) return media.length > 0;
  if (typeof media === "object") return Object.keys(media).length > 0;
  if (typeof media === "string") return media.trim().length > 0;
  return Boolean(media);
};

const readFromPhone = (payload) =>
  String(
    payload?.normalized?.fromPhone ||
      payload?.fromPhone ||
      payload?.data?.fromPhone ||
      payload?.message?.fromPhone ||
      ""
  ).trim();

const findContextInfoInBaileysMessage = (messageNode) => {
  if (!messageNode || typeof messageNode !== "object") return null;
  const candidates = [
    messageNode.extendedTextMessage?.contextInfo,
    messageNode.imageMessage?.contextInfo,
    messageNode.videoMessage?.contextInfo,
    messageNode.documentMessage?.contextInfo,
    messageNode.buttonsResponseMessage?.contextInfo,
    messageNode.templateButtonReplyMessage?.contextInfo,
    messageNode.listResponseMessage?.contextInfo,
    messageNode.ephemeralMessage?.message && findContextInfoInBaileysMessage(messageNode.ephemeralMessage.message),
    messageNode.viewOnceMessage?.message && findContextInfoInBaileysMessage(messageNode.viewOnceMessage.message),
    messageNode.viewOnceMessageV2?.message && findContextInfoInBaileysMessage(messageNode.viewOnceMessageV2.message),
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") return candidate;
  }
  return null;
};

const isAdSourceType = (value) => String(value ?? "").trim().toLowerCase() === "ad";

const isFbAdsConversionSource = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/-/g, "_");
  return normalized === "fb_ads" || normalized === "facebook_ads" || normalized === "ig_ads";
};

const isCtwaEntryPoint = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/-/g, "_");
  return normalized === "ctwa_ad" || normalized === "ctwa";
};

/** Señales fuertes CTWA/Meta; title/body/url solos NO bastan (evita link previews). */
const hasStrongAdCampaignSignal = (contextInfo, externalAdReply) => {
  if (contextInfo && typeof contextInfo === "object") {
    if (isCtwaEntryPoint(contextInfo.entryPointConversionSource)) return true;
    if (isFbAdsConversionSource(contextInfo.conversionSource)) return true;
    if (isFbAdsConversionSource(contextInfo.entryPointConversionExternalSource)) return true;
    if (asNullableString(contextInfo.ctwaPayload)) return true;
  }
  if (!externalAdReply || typeof externalAdReply !== "object") return false;
  if (asNullableString(externalAdReply.ctwaClid)) return true;
  if (externalAdReply.showAdAttribution === true) return true;
  if (externalAdReply.alwaysShowAdAttribution === true) return true;
  if (isAdSourceType(externalAdReply.sourceType)) return true;
  if (externalAdReply.adType != null && externalAdReply.adType !== "") return true;
  return false;
};

const adContextFromExternalAdReply = (externalAdReply, contextInfo) => {
  if (!externalAdReply || typeof externalAdReply !== "object") return null;
  if (!hasStrongAdCampaignSignal(contextInfo, externalAdReply)) return null;
  return {
    isAd: true,
    title: asNullableString(externalAdReply.title),
    body: asNullableString(externalAdReply.body),
    sourceId: asNullableString(externalAdReply.sourceId),
    sourceUrl: asNullableString(externalAdReply.sourceUrl),
    sourceApp: asNullableString(externalAdReply.sourceApp),
    ctwaClid: asNullableString(externalAdReply.ctwaClid),
    mediaUrl: asNullableString(externalAdReply.mediaUrl),
    greetingMessageBody: asNullableString(externalAdReply.greetingMessageBody),
  };
};

const normalizeAdContextObject = (value) => {
  if (!value || typeof value !== "object") return null;
  if (value.isAd !== true) return null;
  return {
    isAd: true,
    title: asNullableString(value.title),
    body: asNullableString(value.body),
    sourceId: asNullableString(value.sourceId),
    sourceUrl: asNullableString(value.sourceUrl),
    sourceApp: asNullableString(value.sourceApp),
    ctwaClid: asNullableString(value.ctwaClid),
    mediaUrl: asNullableString(value.mediaUrl),
    greetingMessageBody: asNullableString(value.greetingMessageBody),
  };
};

/** Prefer WC normalized.adContext; fallback to Baileys raw for older WC workers. */
export const readAdContext = (payload) => {
  const fromNormalized = normalizeAdContextObject(payload?.normalized?.adContext);
  if (fromNormalized) return fromNormalized;

  const rawMessage =
    payload?.raw?.message ||
    payload?.raw?.raw?.message ||
    payload?.data?.raw?.message ||
    null;
  const contextInfo = findContextInfoInBaileysMessage(rawMessage);
  if (!contextInfo) return null;

  const fromExternal = adContextFromExternalAdReply(contextInfo.externalAdReply, contextInfo);
  if (fromExternal) return fromExternal;

  // Sin externalAdReply: algunos CTWA solo traen entryPoint/conversion en contextInfo.
  if (hasStrongAdCampaignSignal(contextInfo, null)) {
    return {
      isAd: true,
      title: null,
      body: null,
      sourceId: null,
      sourceUrl: null,
      sourceApp: asNullableString(contextInfo.entryPointConversionApp),
      ctwaClid: null,
      mediaUrl: null,
      greetingMessageBody: null,
    };
  }

  const quotedAd = contextInfo.quotedAd;
  if (quotedAd && typeof quotedAd === "object") {
    const caption = asNullableString(quotedAd.caption);
    const advertiserName = asNullableString(quotedAd.advertiserName);
    if (caption || advertiserName) {
      return {
        isAd: true,
        title: advertiserName,
        body: caption,
        sourceId: null,
        sourceUrl: null,
        sourceApp: null,
        ctwaClid: null,
        mediaUrl: null,
        greetingMessageBody: null,
      };
    }
  }
  return null;
};

export const normalizeWcInboundEvent = ({ payload, integration, credentials }) => {
  // Mapea payload externo de proveedor al contrato interno canónico del backend.
  const eventType = readEventType(payload);
  const eventId = String(payload?.eventId || payload?.id || payload?.data?.eventId || "").trim();
  const messageId = String(payload?.normalized?.messageId || payload?.message?.id || payload?.data?.message?.id || "").trim() || null;
  const externalUserId = String(
    payload?.normalized?.from || payload?.from || payload?.message?.from || payload?.data?.from || payload?.raw?.key?.remoteJid || ""
  ).trim();
  const text = readText(payload);
  const media = readMedia(payload);
  const unsupportedMediaOnly = !text && mediaHasContent(media);
  const deviceId = readDeviceId(payload) || String(credentials?.deviceId || "").trim();
  const fromPhoneRaw = readFromPhone(payload);
  const displayPhone =
    normalizeDisplayPhone(fromPhoneRaw) || resolveDisplayPhone({ channelId: externalUserId });
  const adContext = readAdContext(payload);

  if (!eventId) throw new ApiError(400, "Missing provider event id");
  if (!externalUserId) throw new ApiError(400, "Missing external user id");
  if (!deviceId) throw new ApiError(400, "Missing device id");

  return {
    provider: "whatsapp-connect",
    channel: "whatsapp",
    integrationId: integration.id,
    ownerUserId: integration.ownerUserId,
    externalUserId,
    displayPhone,
    tenantId: credentials?.tenantId || null,
    deviceId,
    eventId,
    messageId,
    occurredAt: toIsoOrNow(payload?.timestamp || payload?.createdAt || payload?.data?.timestamp),
    direction: "inbound",
    eventType,
    text,
    media,
    unsupportedMediaOnly,
    adContext,
    raw: payload,
    isInboundMessage: eventType === "message.inbound" || eventType === "message_received",
  };
};
