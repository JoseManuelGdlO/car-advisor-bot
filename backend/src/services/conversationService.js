import { Op } from "sequelize";
import { ChannelConversationContext, ClientLead, Conversation, Message } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { isWithinBotSchedule } from "../utils/botSettings.js";
import { channelAllowsAutoReply, normalizeInboundChannel } from "../utils/integrationChannel.js";
import { getOrCreateBotSettings } from "./botSettingsService.js";
import {
  resolveInstagramMetaIntegrationById,
  resolveWhatsappConnectIntegrationById,
} from "./integrationResolverService.js";
import { sendInstagramImageMessage, sendInstagramTextMessage } from "./metaInstagramClient.js";
import { sendPushToOwner } from "./pushService.js";
import { runWithWcToken } from "./wcAuthCache.js";
import { wcClient } from "./wcClient.js";

const hasUsableCustomerInfo = (c) => {
  if (c == null || typeof c !== "object") return false;
  return Object.values(c).some((v) => v != null && String(v).trim() !== "");
};

const isNonEmptyObject = (o) => o && typeof o === "object" && Object.keys(o).length > 0;

export const upsertConversationEvent = async ({
  ownerUserId,
  userId,
  platform,
  message,
  from = "client",
  selectedCar = "",
  customerInfo = {},
  financingSelection = {},
  promotionSelection = {},
}) => {
  // Servicio compartido que centraliza reglas de persistencia y auto-reply por canal.
  if (!ownerUserId) throw new ApiError(500, "owner user is not configured");
  const inboundChannel = normalizeInboundChannel(platform || "web");
  const messageFrom = String(from || "client").trim().toLowerCase();
  const normalizedUserId = String(userId || "").trim();
  const normalizedMessage = String(message || "").trim();
  const normalizedFrom = ["client", "bot", "seller", "user", "assistant", "system"].includes(messageFrom) ? messageFrom : "client";
  const isInboundClientMessage = normalizedFrom === "client" || normalizedFrom === "user";

  if (!normalizedUserId) throw new ApiError(400, "user_id is required");
  if (!normalizedMessage) throw new ApiError(400, "message is required");

  const botSettings = await getOrCreateBotSettings(ownerUserId);
  const scheduleOk = isWithinBotSchedule({
    isEnabled: botSettings.isEnabled,
    timezone: botSettings.timezone,
    weeklySchedule: botSettings.weeklySchedule,
  });
  const integrationOk = await channelAllowsAutoReply(ownerUserId, inboundChannel);
  const shouldAutoReply = scheduleOk && integrationOk;

  const contactDigits = customerInfo?.telefono != null && String(customerInfo.telefono).trim() ? String(customerInfo.telefono).trim() : "";
  const leadPhoneKeys = [normalizedUserId];
  if (contactDigits && contactDigits !== normalizedUserId) leadPhoneKeys.push(contactDigits);

  let lead = await ClientLead.findOne({
    where: { ownerUserId, phone: { [Op.in]: leadPhoneKeys } },
  });
  if (!lead) {
    lead = await ClientLead.create({
      ownerUserId,
      name: (customerInfo?.nombre && String(customerInfo.nombre).trim()) || "Cliente",
      phone: normalizedUserId,
      channel: inboundChannel,
      interestedIn: selectedCar || "",
      status: "lead",
      lastMessage: isInboundClientMessage ? normalizedMessage : "",
      lastMessageAt: isInboundClientMessage ? new Date() : null,
    });
  }

  let currentNotes;
  try {
    currentNotes = lead.notes ? JSON.parse(String(lead.notes)) : {};
  } catch {
    currentNotes = {};
  }
  const prevInfo =
    currentNotes && typeof currentNotes === "object" && currentNotes.customer_info && typeof currentNotes.customer_info === "object"
      ? currentNotes.customer_info
      : {};
  let mergedCustomerInfo = hasUsableCustomerInfo(customerInfo) ? { ...prevInfo, ...customerInfo } : { ...prevInfo };
  if (String(lead.phone) !== String(normalizedUserId)) {
    const previousPhone = String(lead.phone);
    if (previousPhone && !String(mergedCustomerInfo.telefono || "").trim()) {
      mergedCustomerInfo = { ...mergedCustomerInfo, telefono: previousPhone };
    }
  }
  const prevFinancing =
    currentNotes && typeof currentNotes === "object" && currentNotes.financing_selection && typeof currentNotes.financing_selection === "object"
      ? currentNotes.financing_selection
      : {};
  const mergedFinancing = isNonEmptyObject(financingSelection) ? { ...prevFinancing, ...financingSelection } : { ...prevFinancing };
  const prevPromotion =
    currentNotes && typeof currentNotes === "object" && currentNotes.promotion_selection && typeof currentNotes.promotion_selection === "object"
      ? currentNotes.promotion_selection
      : {};
  const mergedPromotion = isNonEmptyObject(promotionSelection) ? { ...prevPromotion, ...promotionSelection } : { ...prevPromotion };
  const mergedNotes = {
    ...currentNotes,
    ...(Object.keys(mergedCustomerInfo).length ? { customer_info: mergedCustomerInfo } : {}),
    ...(Object.keys(mergedFinancing).length ? { financing_selection: mergedFinancing } : {}),
    ...(Object.keys(mergedPromotion).length ? { promotion_selection: mergedPromotion } : {}),
  };
  const leadFieldUpdates = {
    interestedIn: selectedCar || lead.interestedIn,
    lastMessage: isInboundClientMessage ? normalizedMessage : lead.lastMessage,
    lastMessageAt: isInboundClientMessage ? new Date() : lead.lastMessageAt,
    notes: Object.keys(mergedNotes).length ? JSON.stringify(mergedNotes) : lead.notes,
  };
  if (String(lead.phone) !== String(normalizedUserId)) leadFieldUpdates.phone = normalizedUserId;
  if (hasUsableCustomerInfo(customerInfo)) {
    const n = String(customerInfo.nombre || "").trim();
    if (n) leadFieldUpdates.name = n;
  }
  await lead.update(leadFieldUpdates);

  const [conv] = await Conversation.findOrCreate({
    where: { ownerUserId, clientLeadId: lead.id },
    defaults: {
      ownerUserId,
      clientLeadId: lead.id,
      channel: inboundChannel,
      lastMessage: isInboundClientMessage ? normalizedMessage : "",
      lastTime: isInboundClientMessage ? new Date() : null,
      unread: 0,
    },
  });
  const isHumanControlled = Boolean(conv.isHumanControlled);
  await conv.update({
    lastMessage: isInboundClientMessage ? normalizedMessage : conv.lastMessage,
    lastTime: isInboundClientMessage ? new Date() : conv.lastTime,
  });

  await Message.create({
    ownerUserId,
    conversationId: conv.id,
    from: normalizedFrom,
    text: normalizedMessage,
    platform: inboundChannel,
    phone: normalizedUserId,
    time: new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  });

  if (isInboundClientMessage) {
    try {
      await sendPushToOwner({
        ownerUserId,
        title: "Nuevo cliente quiere platicar",
        body: `${lead.name || "Cliente"}: ${normalizedMessage.slice(0, 140)}`,
        data: {
          type: "chat_intent",
          conversationId: conv.id,
        },
      });
    } catch {
      // Non-blocking push side effect.
    }
  }

  let suppressedReason;
  if (!shouldAutoReply) {
    if (!scheduleOk) suppressedReason = "schedule_or_disabled";
    else if (!integrationOk) suppressedReason = "integration";
  }

  return {
    conversationId: conv.id,
    clientId: lead.id,
    shouldAutoReply: shouldAutoReply && !isHumanControlled,
    botSuppressed: !shouldAutoReply || isHumanControlled,
    suppressedReason: isHumanControlled ? "human_control" : suppressedReason,
    ownerUserId,
  };
};

const formatMessageTime = () => new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

const getOwnedConversation = async ({ ownerUserId, conversationId }) => {
  const conv = await Conversation.findOne({
    where: { id: conversationId, ownerUserId },
    include: [{ model: ClientLead, as: "client" }],
  });
  if (!conv) throw new ApiError(404, "Conversation not found");
  return conv;
};

const getConversationContext = async ({ ownerUserId, conversationId }) => {
  return ChannelConversationContext.findOne({
    where: { ownerUserId, conversationId },
    order: [["updatedAt", "DESC"]],
  });
};

const persistSellerMessage = async ({ ownerUserId, conversationId, channel, text, phone }) => {
  const msg = await Message.create({
    ownerUserId,
    conversationId,
    from: "seller",
    text: String(text || "").trim(),
    platform: channel,
    phone: String(phone || "").trim() || null,
    time: formatMessageTime(),
  });
  await Conversation.update(
    {
      lastMessage: msg.text,
      lastTime: new Date(),
    },
    { where: { id: conversationId, ownerUserId } }
  );
  return msg;
};

export const sendConversationTextMessage = async ({ ownerUserId, conversationId, text }) => {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) throw new ApiError(400, "text is required");
  const conversation = await getOwnedConversation({ ownerUserId, conversationId });
  const context = await getConversationContext({ ownerUserId, conversationId });
  const channel = String(conversation.channel || "web").toLowerCase();
  const recipient = String(context?.externalUserId || conversation.client?.phone || "").trim();
  if (!recipient) throw new ApiError(400, "Conversation recipient is not available");

  if (channel === "whatsapp") {
    if (!context?.channelIntegrationId) throw new ApiError(400, "Conversation is missing WhatsApp integration context");
    const { credentials } = await resolveWhatsappConnectIntegrationById({
      ownerUserId,
      integrationId: context.channelIntegrationId,
    });
    await runWithWcToken(() =>
      wcClient.sendMessageWithRetry({
        deviceId: context.deviceId || credentials.deviceId,
        to: recipient,
        type: "text",
        text: normalizedText,
        tenantId: context.tenantId || credentials.tenantId,
      })
    );
  } else if (channel === "instagram") {
    if (!context?.channelIntegrationId) throw new ApiError(400, "Conversation is missing Instagram integration context");
    const { credentials } = await resolveInstagramMetaIntegrationById({
      ownerUserId,
      integrationId: context.channelIntegrationId,
    });
    await sendInstagramTextMessage({
      pageId: credentials.pageId,
      pageAccessToken: credentials.pageAccessToken,
      recipientIgsid: recipient,
      text: normalizedText,
    });
  } else {
    throw new ApiError(400, `Outbound send is not supported for channel: ${channel}`);
  }

  return persistSellerMessage({
    ownerUserId,
    conversationId,
    channel,
    text: normalizedText,
    phone: recipient,
  });
};

export const sendConversationAttachmentMessage = async ({
  ownerUserId,
  conversationId,
  imageUrl,
  caption,
}) => {
  const url = String(imageUrl || "").trim();
  if (!url) throw new ApiError(400, "imageUrl is required");
  const conversation = await getOwnedConversation({ ownerUserId, conversationId });
  const context = await getConversationContext({ ownerUserId, conversationId });
  const channel = String(conversation.channel || "web").toLowerCase();
  const recipient = String(context?.externalUserId || conversation.client?.phone || "").trim();
  if (!recipient) throw new ApiError(400, "Conversation recipient is not available");
  const normalizedCaption = String(caption || "").trim();

  if (channel === "whatsapp") {
    if (!context?.channelIntegrationId) throw new ApiError(400, "Conversation is missing WhatsApp integration context");
    const { credentials } = await resolveWhatsappConnectIntegrationById({
      ownerUserId,
      integrationId: context.channelIntegrationId,
    });
    await runWithWcToken(() =>
      wcClient.sendMessageWithRetry({
        deviceId: context.deviceId || credentials.deviceId,
        to: recipient,
        type: "image",
        imageUrl: url,
        ...(normalizedCaption ? { caption: normalizedCaption } : {}),
        tenantId: context.tenantId || credentials.tenantId,
      })
    );
  } else if (channel === "instagram") {
    if (!context?.channelIntegrationId) throw new ApiError(400, "Conversation is missing Instagram integration context");
    const { credentials } = await resolveInstagramMetaIntegrationById({
      ownerUserId,
      integrationId: context.channelIntegrationId,
    });
    await sendInstagramImageMessage({
      pageId: credentials.pageId,
      pageAccessToken: credentials.pageAccessToken,
      recipientIgsid: recipient,
      imageUrl: url,
      caption: normalizedCaption,
    });
    if (normalizedCaption) {
      await sendInstagramTextMessage({
        pageId: credentials.pageId,
        pageAccessToken: credentials.pageAccessToken,
        recipientIgsid: recipient,
        text: normalizedCaption,
      });
    }
  } else {
    throw new ApiError(400, `Outbound attachment is not supported for channel: ${channel}`);
  }

  const storedText = normalizedCaption ? `${normalizedCaption}\n${url}` : `[Imagen] ${url}`;
  return persistSellerMessage({
    ownerUserId,
    conversationId,
    channel,
    text: storedText,
    phone: recipient,
  });
};
