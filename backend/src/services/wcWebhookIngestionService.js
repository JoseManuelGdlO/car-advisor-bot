import {
  ChannelConversationContext,
  ChannelEventReceipt,
} from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { upsertConversationEvent } from "./conversationService.js";
import { runBotChat } from "./botEngineClient.js";
import { debounceAndFlush } from "./messageDebounceBuffer.js";
import { isPhoneBlacklisted } from "./phoneBlacklistService.js";
import { runWithWcToken } from "./wcAuthCache.js";
import { wcClient } from "./wcClient.js";
import { logWcWebhook, logWcWebhookDebug } from "../utils/wcWebhookLog.js";

/** CRM: resumen cuando el usuario envía solo media/adjuntos (sin invocar el bot). */
export const UNSUPPORTED_INBOUND_CRM_CLIENT_MESSAGE =
  "El usuario envió un archivo o imagen (formato no soportado).";

/** Respuesta automática al canal pidiendo solo texto. */
export const UNSUPPORTED_INBOUND_OUTBOUND_REPLY =
  "Por ahora no puedo leer archivos, imágenes ni otros adjuntos. " +
  "Ese formato no está soportado: por favor escríbeme solo con texto y con gusto te ayudo.";

const PROVIDER = "whatsapp-connect";

const updateContext = async ({ normalizedEvent, conversationResult }) => {
  // Mantiene el vínculo externo->interno para responder con el device/tenant correcto.
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

export const shouldIgnoreBlacklistedWhatsappEvent = ({ ownerUserId, displayPhone }) =>
  isPhoneBlacklisted({ ownerUserId, displayPhone });

export const ingestWhatsappConnectEvent = async ({ normalizedEvent, credentials: _credentials }) => {
  // Ejecuta pipeline completo inbound: dedupe, persistencia, bot y outbound.
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
      logWcWebhook("receipt duplicate (constraint)", {
        providerEventId: normalizedEvent.eventId,
        channelIntegrationId: normalizedEvent.integrationId,
      });
      throw new ApiError(409, "Duplicated webhook event");
    }
    logWcWebhook("receipt create failed", {
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

  if (await shouldIgnoreBlacklistedWhatsappEvent({
    ownerUserId: normalizedEvent.ownerUserId,
    displayPhone: normalizedEvent.displayPhone,
  })) {
    logWcWebhookDebug(`Telefono en blacklist: ${normalizedEvent.displayPhone} ignorado`);
    await markReceipt(receipt, "ignored");
    return { ok: true, blocked: true };
  }

  const clientCrmMessage = unsupportedMediaOnly ? UNSUPPORTED_INBOUND_CRM_CLIENT_MESSAGE : incomingMessage;

  try {
    logWcWebhookDebug("pipeline: upsert client message", {
      externalUserId: String(normalizedEvent.externalUserId || "").slice(0, 80),
      messageId: normalizedEvent.messageId,
      unsupportedMediaOnly,
    });
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
    logWcWebhook("pipeline: conversation upserted", {
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
      logWcWebhookDebug("pipeline: unsupported media only, canned reply (no bot)", {
        userId: normalizedEvent.externalUserId,
      });
      await upsertConversationEvent({
        ownerUserId: normalizedEvent.ownerUserId,
        userId: normalizedEvent.externalUserId,
        platform: "whatsapp",
        message: replyText,
        from: "assistant",
        selectedCar: "",
        customerInfo: {},
        financingSelection: {},
      });
      logWcWebhookDebug("pipeline: send outbound", { to: String(normalizedEvent.externalUserId || "").slice(0, 64) });
      await runWithWcToken(
        async () =>
          wcClient.sendMessageWithRetry({
            deviceId: normalizedEvent.deviceId,
            to: normalizedEvent.externalUserId,
            type: "text",
            text: replyText,
            tenantId: normalizedEvent.tenantId,
          })
      );
      await markReceipt(receipt, "processed");
      return { ok: true, conversationId: conversationResult.conversationId, repliesSent: 1, unsupportedMediaOnly: true };
    }

    logWcWebhookDebug("pipeline: calling bot engine (debounced)", { userId: normalizedEvent.externalUserId });
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
      logWcWebhookDebug("pipeline: debounced follower, skip outbound", {
        providerEventId: normalizedEvent.eventId,
      });
      await markReceipt(receipt, "processed");
      return { ok: true, debounced: true, conversationId: conversationResult.conversationId };
    }

    logWcWebhook("pipeline: bot replies", { providerEventId: normalizedEvent.eventId, count: botReplies.length });
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
      await upsertConversationEvent({
        ownerUserId: normalizedEvent.ownerUserId,
        userId: normalizedEvent.externalUserId,
        platform: "whatsapp",
        message: messageForCrm,
        from: "assistant",
        selectedCar: "",
        customerInfo: {},
        financingSelection: {},
      });
      logWcWebhookDebug("pipeline: send outbound", { to: String(normalizedEvent.externalUserId || "").slice(0, 64) });
      await runWithWcToken(
        async () =>
          wcClient.sendMessageWithRetry({
            deviceId: normalizedEvent.deviceId,
            to: normalizedEvent.externalUserId,
            ...(isImage
              ? {
                  type: "image",
                  imageUrl,
                  ...(caption ? { caption } : {}),
                }
              : isDocument
                ? {
                    type: "document",
                    documentUrl,
                    fileName,
                    ...(caption ? { caption } : {}),
                  }
                : {
                    type: "text",
                    text: replyText,
                  }),
            tenantId: normalizedEvent.tenantId,
          })
      );
    }

    await markReceipt(receipt, "processed");
    return { ok: true, conversationId: conversationResult.conversationId, repliesSent: botReplies.length };
  } catch (error) {
    logWcWebhook("pipeline: failed", {
      providerEventId: normalizedEvent.eventId,
      receiptId: receipt?.id,
      message: error?.message,
      status: error?.status,
    });
    await markReceipt(receipt, "failed", error?.message || "Unhandled error");
    throw error;
  }
};
