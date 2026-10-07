import {
  ChannelConversationContext,
  ChannelEventReceipt,
} from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { upsertConversationEvent } from "./conversationService.js";
import { runBotChat } from "./botEngineClient.js";
import { debounceAndFlush } from "./messageDebounceBuffer.js";
import { isPhoneBlacklisted } from "./phoneBlacklistService.js";
import { formatCampaignCrmMessage } from "../utils/campaignCrmMessage.js";
import {
  sendWhatsappDocument,
  sendWhatsappImage,
  sendWhatsappText,
} from "./metaWhatsappClient.js";

/** CRM: resumen cuando el usuario envía solo media/adjuntos (sin invocar el bot). */
export const UNSUPPORTED_INBOUND_CRM_CLIENT_MESSAGE =
  "El usuario envió un archivo o imagen (formato no soportado).";

/** Respuesta automática al canal pidiendo solo texto. */
export const UNSUPPORTED_INBOUND_OUTBOUND_REPLY =
  "Por ahora no puedo leer archivos, imágenes ni otros adjuntos. " +
  "Ese formato no está soportado: por favor escríbeme solo con texto y con gusto te ayudo.";

const PROVIDER = "meta";
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

const updateContext = async ({ normalizedEvent, conversationResult }) => {
  await ChannelConversationContext.upsert({
    ownerUserId: normalizedEvent.ownerUserId,
    channel: normalizedEvent.channel,
    externalUserId: normalizedEvent.externalUserId,
    channelIntegrationId: normalizedEvent.integrationId,
    deviceId: normalizedEvent.deviceId,
    tenantId: normalizedEvent.tenantId,
    conversationId: conversationResult.conversationId,
    clientLeadId: conversationResult.clientId,
    lastProviderMessageId: normalizedEvent.messageId,
    lastSeenAt: new Date(),
  });
};

const markReceipt = async (receipt, status, errorMessage) => {
  await receipt.update({
    status,
    error: errorMessage ? String(errorMessage).slice(0, 500) : null,
  });
};

const persistAssistantReply = async ({ normalizedEvent, message }) => {
  if (!message) return;
  await upsertConversationEvent({
    ownerUserId: normalizedEvent.ownerUserId,
    userId: normalizedEvent.externalUserId,
    platform: "whatsapp",
    message,
    from: "assistant",
    selectedCar: "",
    customerInfo: {},
    financingSelection: {},
  });
};

const sendCloudOutbound = async ({ credentials, to, type, text, imageUrl, documentUrl, fileName, caption }) => {
  const phoneNumberId = credentials?.phoneNumberId;
  const accessToken = credentials?.accessToken;
  if (type === "image") {
    await sendWhatsappImage({ phoneNumberId, accessToken, to, imageUrl, caption });
    return;
  }
  if (type === "document") {
    await sendWhatsappDocument({ phoneNumberId, accessToken, to, documentUrl, fileName, caption });
    return;
  }
  await sendWhatsappText({ phoneNumberId, accessToken, to, text });
};

export const shouldIgnoreBlacklistedWhatsappEvent = ({ ownerUserId, displayPhone }) =>
  isPhoneBlacklisted({ ownerUserId, displayPhone });

export const ingestWhatsappCloudEvent = async ({ normalizedEvent, credentials }) => {
  let receipt;
  try {
    receipt = await ChannelEventReceipt.create({
      ownerUserId: normalizedEvent.ownerUserId,
      channelIntegrationId: normalizedEvent.integrationId,
      provider: PROVIDER,
      providerEventId: normalizedEvent.eventId,
      eventType: normalizedEvent.eventType || null,
      status: "accepted",
      receivedAt: new Date(),
    });
  } catch (error) {
    if (error?.name === "SequelizeUniqueConstraintError") {
      logWaCloud("receipt duplicate (constraint)", {
        providerEventId: normalizedEvent.eventId,
        channelIntegrationId: normalizedEvent.integrationId,
      });
      throw new ApiError(409, "Duplicated webhook event");
    }
    logWaCloud("receipt create failed", {
      providerEventId: normalizedEvent.eventId,
      message: error?.message,
      name: error?.name,
    });
    throw error;
  }

  if (!normalizedEvent.isInboundMessage) {
    await markReceipt(receipt, "ignored");
    return { ok: true, ignored: true };
  }

  const incomingMessage = String(normalizedEvent.text || "").trim();
  const unsupportedMediaOnly = Boolean(normalizedEvent.unsupportedMediaOnly);
  if (!incomingMessage && !unsupportedMediaOnly) {
    await markReceipt(receipt, "ignored");
    return { ok: true, ignored: true };
  }

  if (
    await shouldIgnoreBlacklistedWhatsappEvent({
      ownerUserId: normalizedEvent.ownerUserId,
      displayPhone: normalizedEvent.displayPhone,
    })
  ) {
    logWaCloud(`Telefono en blacklist: ${normalizedEvent.displayPhone} ignorado`);
    await markReceipt(receipt, "ignored");
    return { ok: true, blocked: true };
  }

  const clientCrmMessage = unsupportedMediaOnly
    ? UNSUPPORTED_INBOUND_CRM_CLIENT_MESSAGE
    : formatCampaignCrmMessage(incomingMessage, normalizedEvent.adContext);

  try {
    const conversationResult = await upsertConversationEvent({
      ownerUserId: normalizedEvent.ownerUserId,
      userId: normalizedEvent.externalUserId,
      displayPhone: normalizedEvent.displayPhone,
      platform: "whatsapp",
      message: clientCrmMessage,
      from: "client",
      selectedCar: "",
      customerInfo: {},
      financingSelection: {},
    });

    await updateContext({ normalizedEvent, conversationResult });
    logWaCloud("pipeline: conversation upserted", {
      providerEventId: normalizedEvent.eventId,
      conversationId: conversationResult.conversationId,
      shouldAutoReply: conversationResult.shouldAutoReply,
    });

    if (!conversationResult.shouldAutoReply) {
      await markReceipt(receipt, "processed");
      return { ok: true, suppressed: true, conversationId: conversationResult.conversationId };
    }

    if (unsupportedMediaOnly) {
      const replyText = UNSUPPORTED_INBOUND_OUTBOUND_REPLY;
      await persistAssistantReply({ normalizedEvent, message: replyText });
      logWaCloud("pipeline: send outbound", {
        to: String(normalizedEvent.externalUserId || "").slice(0, 64),
        type: "text",
      });
      await sendCloudOutbound({
        credentials,
        to: normalizedEvent.externalUserId,
        type: "text",
        text: replyText,
      });
      await markReceipt(receipt, "processed");
      return { ok: true, conversationId: conversationResult.conversationId, repliesSent: 1, unsupportedMediaOnly: true };
    }

    const { isFlushLeader, botReplies } = await debounceAndFlush({
      key: `${normalizedEvent.ownerUserId}:whatsapp:${normalizedEvent.externalUserId}`,
      message: incomingMessage,
      adContext: normalizedEvent.adContext,
      flush: ({ message, adContext }) =>
        runBotChat({
          userId: normalizedEvent.externalUserId,
          platform: "whatsapp",
          message,
          ownerUserId: normalizedEvent.ownerUserId,
          conversationId: conversationResult.conversationId,
          adContext,
        }),
    });

    if (!isFlushLeader) {
      await markReceipt(receipt, "processed");
      return { ok: true, debounced: true, conversationId: conversationResult.conversationId };
    }

    logWaCloud("pipeline: bot replies", { providerEventId: normalizedEvent.eventId, count: botReplies.length });
    for (const reply of botReplies) {
      const normalizedType = String(reply?.type || "text").trim().toLowerCase();
      const isImage = normalizedType === "image";
      const isDocument = normalizedType === "document";
      const replyText = String(reply?.text || "").trim();
      const imageUrl = String(reply?.imageUrl || "").trim();
      const documentUrl = String(reply?.documentUrl || "").trim();
      const fileName = String(reply?.fileName || "").trim();
      const caption = String(reply?.caption || "").trim();
      const messageForCrm = isImage
        ? caption || "Imagen del vehiculo"
        : isDocument
          ? caption || "Ficha técnica"
          : replyText;

      if (!messageForCrm && !imageUrl && !documentUrl) continue;
      await persistAssistantReply({ normalizedEvent, message: messageForCrm });
      logWaCloud("pipeline: send outbound", {
        to: String(normalizedEvent.externalUserId || "").slice(0, 64),
        type: isImage ? "image" : isDocument ? "document" : "text",
      });
      await sendCloudOutbound({
        credentials,
        to: normalizedEvent.externalUserId,
        type: isImage ? "image" : isDocument ? "document" : "text",
        text: replyText,
        imageUrl,
        documentUrl,
        fileName,
        caption,
      });
    }

    await markReceipt(receipt, "processed");
    return { ok: true, conversationId: conversationResult.conversationId, repliesSent: botReplies.length };
  } catch (error) {
    logWaCloud("pipeline: failed", {
      providerEventId: normalizedEvent.eventId,
      receiptId: receipt?.id,
      message: error?.message,
      status: error?.status,
    });
    try {
      await markReceipt(receipt, "failed", error?.message || "Unhandled error");
    } catch (markError) {
      logWaCloud("receipt mark failed", {
        providerEventId: normalizedEvent.eventId,
        message: markError?.message,
      });
    }
    return { ok: true, persisted: true, failed: true };
  }
};
