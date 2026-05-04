import {
  ChannelConversationContext,
  ChannelEventReceipt,
} from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { upsertConversationEvent } from "./conversationService.js";
import { runBotChat } from "./botEngineClient.js";
import { sendInstagramTextMessage } from "./metaInstagramClient.js";
import { logIgWebhook, logIgWebhookDebug } from "../utils/instagramWebhookLog.js";

const PROVIDER = "meta-instagram";

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

export const ingestInstagramMetaEvent = async ({ normalizedEvent, credentials }) => {
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
      logIgWebhook("receipt duplicate (constraint)", {
        providerEventId: normalizedEvent.eventId,
        channelIntegrationId: normalizedEvent.integrationId,
      });
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
    logIgWebhookDebug("pipeline: upsert client message", {
      externalUserId: String(normalizedEvent.externalUserId || "").slice(0, 80),
      messageId: normalizedEvent.messageId,
    });
    const conversationResult = await upsertConversationEvent({
      ownerUserId: normalizedEvent.ownerUserId,
      userId: normalizedEvent.externalUserId,
      platform: "instagram",
      message: incomingMessage,
      from: "client",
      selectedCar: "",
      customerInfo: {},
      financingSelection: {},
    });

    await updateContext({ normalizedEvent, conversationResult });
    logIgWebhook("pipeline: conversation upserted", {
      providerEventId: normalizedEvent.eventId,
      conversationId: conversationResult.conversationId,
      shouldAutoReply: conversationResult.shouldAutoReply,
    });

    if (!conversationResult.shouldAutoReply) {
      await markReceipt(receipt, "processed");
      return { ok: true, suppressed: true, conversationId: conversationResult.conversationId };
    }

    logIgWebhookDebug("pipeline: calling bot engine", { userId: normalizedEvent.externalUserId });
    const botReplies = await runBotChat({
      userId: normalizedEvent.externalUserId,
      platform: "instagram",
      message: incomingMessage,
    });

    logIgWebhook("pipeline: bot replies", { providerEventId: normalizedEvent.eventId, count: botReplies.length });
    for (const reply of botReplies) {
      const normalizedType = String(reply?.type || "text").trim().toLowerCase();
      const isImage = normalizedType === "image";
      const replyText = String(reply?.text || "").trim();
      const caption = String(reply?.caption || "").trim();
      const messageForCrm = isImage ? caption || "Imagen del vehiculo" : replyText;

      if (isImage) {
        logIgWebhook("pipeline: skip image outbound (MVP texto solo)", {
          providerEventId: normalizedEvent.eventId,
        });
        if (messageForCrm) {
          await upsertConversationEvent({
            ownerUserId: normalizedEvent.ownerUserId,
            userId: normalizedEvent.externalUserId,
            platform: "instagram",
            message: messageForCrm,
            from: "assistant",
            selectedCar: "",
            customerInfo: {},
            financingSelection: {},
          });
        }
        continue;
      }

      if (!messageForCrm) continue;
      await upsertConversationEvent({
        ownerUserId: normalizedEvent.ownerUserId,
        userId: normalizedEvent.externalUserId,
        platform: "instagram",
        message: messageForCrm,
        from: "assistant",
        selectedCar: "",
        customerInfo: {},
        financingSelection: {},
      });
      logIgWebhookDebug("pipeline: send outbound", { to: String(normalizedEvent.externalUserId || "").slice(0, 64) });
      await sendInstagramTextMessage({
        pageId: credentials.pageId,
        pageAccessToken: credentials.pageAccessToken,
        recipientIgsid: normalizedEvent.externalUserId,
        text: replyText,
      });
    }

    await markReceipt(receipt, "processed");
    return { ok: true, conversationId: conversationResult.conversationId, repliesSent: botReplies.length };
  } catch (error) {
    logIgWebhook("pipeline: failed", {
      providerEventId: normalizedEvent.eventId,
      receiptId: receipt?.id,
      message: error?.message,
      status: error?.status,
    });
    await markReceipt(receipt, "failed", error?.message || "Unhandled error");
    throw error;
  }
};
