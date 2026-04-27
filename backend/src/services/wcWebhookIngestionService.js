import {
  ChannelConversationContext,
  ChannelEventReceipt,
} from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { upsertConversationEvent } from "./conversationService.js";
import { runBotChat } from "./botEngineClient.js";
import { runWithWcToken } from "./wcAuthCache.js";
import { wcClient } from "./wcClient.js";

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

export const ingestWhatsappConnectEvent = async ({ normalizedEvent, credentials }) => {
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
      throw new ApiError(409, "Duplicated webhook event");
    }
    throw error;
  }

  if (!normalizedEvent.isInboundMessage) {
    await markReceipt(receipt, "ignored");
    return { ok: true, ignored: true };
  }

  const incomingMessage = String(normalizedEvent.text || "").trim();
  if (!incomingMessage) {
    await markReceipt(receipt, "ignored");
    return { ok: true, ignored: true };
  }

  try {
    const conversationResult = await upsertConversationEvent({
      ownerUserId: normalizedEvent.ownerUserId,
      userId: normalizedEvent.externalUserId,
      platform: "whatsapp",
      message: incomingMessage,
      from: "client",
      selectedCar: "",
      customerInfo: {},
      financingSelection: {},
    });

    await updateContext({ normalizedEvent, conversationResult });

    if (!conversationResult.shouldAutoReply) {
      await markReceipt(receipt, "processed");
      return { ok: true, suppressed: true, conversationId: conversationResult.conversationId };
    }

    const botReplies = await runBotChat({
      userId: normalizedEvent.externalUserId,
      platform: "whatsapp",
      message: incomingMessage,
    });

    for (const reply of botReplies) {
      await upsertConversationEvent({
        ownerUserId: normalizedEvent.ownerUserId,
        userId: normalizedEvent.externalUserId,
        platform: "whatsapp",
        message: reply,
        from: "assistant",
        selectedCar: "",
        customerInfo: {},
        financingSelection: {},
      });
      await runWithWcToken(
        async (token) =>
          wcClient.sendMessageWithRetry({
            deviceId: normalizedEvent.deviceId,
            token,
            to: normalizedEvent.externalUserId,
            type: "text",
            text: reply,
            tenantId: normalizedEvent.tenantId,
          }),
        {
          cacheKey: credentials.apiEmail || credentials.apiKey || normalizedEvent.integrationId,
          loginArgs: {
            email: credentials.apiEmail,
            password: credentials.apiPassword,
            apiKey: credentials.apiKey,
          },
        }
      );
    }

    await markReceipt(receipt, "processed");
    return { ok: true, conversationId: conversationResult.conversationId, repliesSent: botReplies.length };
  } catch (error) {
    await markReceipt(receipt, "failed", error?.message || "Unhandled error");
    throw error;
  }
};
