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
import { setBotSessionDisabled } from "./botEngineClient.js";
import { sendPushToOwner } from "./pushService.js";
import { runWithWcToken } from "./wcAuthCache.js";
import { wcClient } from "./wcClient.js";
import { isWhatsappChannelId, resolveDisplayPhone } from "../utils/whatsappIdentity.js";

const hasUsableCustomerInfo = (c) => {
  if (c == null || typeof c !== "object") return false;
  return Object.values(c).some((v) => v != null && String(v).trim() !== "");
};

const isNonEmptyObject = (o) => o && typeof o === "object" && Object.keys(o).length > 0;

export const ELIMINATED_LEAD_STATUS = "eliminated";

const visibleLeadStatusWhere = () => ({ status: { [Op.ne]: ELIMINATED_LEAD_STATUS } });

/** Decide si crear, reactivar o reutilizar un lead al recibir evento conversacional. */
export const resolveLeadUpsertOutcome = (
  existing,
  { inboundChannel, customerInfo, isInboundClientMessage, normalizedMessage },
) => {
  if (!existing) return { kind: "create" };
  if (existing.status === ELIMINATED_LEAD_STATUS) {
    const nameFromInfo = customerInfo?.nombre && String(customerInfo.nombre).trim();
    return {
      kind: "reactivate",
      patch: {
        status: "lead",
        channel: inboundChannel,
        ...(nameFromInfo ? { name: nameFromInfo } : {}),
        ...(isInboundClientMessage
          ? { lastMessage: normalizedMessage, lastMessageAt: new Date() }
          : {}),
      },
    };
  }
  return { kind: "use_existing" };
};

/** Calcula displayPhone para crear/actualizar lead sin sobrescribir con valores vacíos. */
export const buildLeadDisplayPhoneUpdate = ({ displayPhone, channelUserId, customerTelefono, existingDisplayPhone }) => {
  const incoming = resolveDisplayPhone({
    fromPhone: displayPhone,
    channelId: channelUserId,
    customerTelefono,
  });
  if (!incoming) return {};
  return { displayPhone: incoming };
};

export const upsertConversationEvent = async ({
  ownerUserId,
  userId,
  displayPhone = null,
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

  const resolvedDisplayPhone = resolveDisplayPhone({
    fromPhone: displayPhone,
    channelId: normalizedUserId,
    customerTelefono: contactDigits,
  });

  let lead = null;
  const existingContext = await ChannelConversationContext.findOne({
    where: {
      ownerUserId,
      externalUserId: normalizedUserId,
      channel: inboundChannel,
    },
    order: [["updatedAt", "DESC"]],
  });
  if (existingContext?.clientLeadId) {
    lead = await ClientLead.findOne({
      where: { id: existingContext.clientLeadId, ownerUserId, ...visibleLeadStatusWhere() },
    });
  }
  if (!lead) {
    lead = await ClientLead.findOne({
      where: { ownerUserId, phone: { [Op.in]: leadPhoneKeys }, ...visibleLeadStatusWhere() },
    });
  }
  if (!lead) {
    lead = await ClientLead.create({
      ownerUserId,
      name: (customerInfo?.nombre && String(customerInfo.nombre).trim()) || "Cliente",
      phone: normalizedUserId,
      displayPhone: resolvedDisplayPhone,
      channel: inboundChannel,
      interestedIn: selectedCar || "",
      status: "lead",
      lastMessage: isInboundClientMessage ? normalizedMessage : "",
      lastMessageAt: isInboundClientMessage ? new Date() : null,
    });
  } else {
    const leadOutcome = resolveLeadUpsertOutcome(lead, {
      inboundChannel,
      customerInfo,
      isInboundClientMessage,
      normalizedMessage,
    });
    if (leadOutcome.kind === "reactivate") {
      await lead.update(leadOutcome.patch);
      await lead.reload();
    }
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
    if (previousPhone && !isWhatsappChannelId(previousPhone) && !String(mergedCustomerInfo.telefono || "").trim()) {
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
  if (resolvedDisplayPhone) leadFieldUpdates.displayPhone = resolvedDisplayPhone;
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
  const isSystemMessage = normalizedFrom === "system";
  const isAssistantMessage = normalizedFrom === "assistant" || normalizedFrom === "bot";
  const shouldUpdatePreview = isInboundClientMessage || isSystemMessage || isAssistantMessage;
  await conv.update({
    lastMessage: shouldUpdatePreview ? normalizedMessage : conv.lastMessage,
    lastTime: shouldUpdatePreview ? new Date() : conv.lastTime,
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
      const pushPhone = String(lead.displayPhone || resolvedDisplayPhone || "Cliente").trim() || "Cliente";
      await sendPushToOwner({
        ownerUserId,
        title: `${pushPhone} mandó un mensaje`,
        body: `${lead.name || "Cliente"}: ${normalizedMessage.slice(0, 140)}`,
        data: {
          type: "chat_intent",
          notification_kind: "new_inbound_message",
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
    clientName: lead.name || "",
    clientDisplayPhone: lead.displayPhone || "",
    customerInfo: mergedCustomerInfo,
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

const ALLOWED_OUTBOUND_FROM = new Set(["seller", "assistant", "bot"]);

const persistOutboundMessage = async ({ ownerUserId, conversationId, channel, text, phone, from = "seller" }) => {
  const sender = ALLOWED_OUTBOUND_FROM.has(from) ? from : "seller";
  const msg = await Message.create({
    ownerUserId,
    conversationId,
    from: sender,
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

export const sendConversationTextMessage = async ({
  ownerUserId,
  conversationId,
  text,
  senderRole = "seller",
}) => {
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

  return persistOutboundMessage({
    ownerUserId,
    conversationId,
    channel,
    text: normalizedText,
    phone: recipient,
    from: senderRole,
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
  return persistOutboundMessage({
    ownerUserId,
    conversationId,
    channel,
    text: storedText,
    phone: recipient,
  });
};

/** Elimina financing_selection y promotion_selection de notes; conserva customer_info. */
export const buildNotesWithoutCommercialSelections = (notes) => {
  const emptyResult = { notes: null, hadFinancing: false, hadPromotion: false };
  if (!notes) return emptyResult;
  let parsed;
  try {
    parsed = JSON.parse(String(notes));
  } catch {
    return emptyResult;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyResult;

  const hadFinancing = Boolean(isNonEmptyObject(parsed.financing_selection));
  const hadPromotion = Boolean(isNonEmptyObject(parsed.promotion_selection));
  const nextNotes = { ...parsed };
  delete nextNotes.financing_selection;
  delete nextNotes.promotion_selection;

  const keys = Object.keys(nextNotes);
  return {
    notes: keys.length > 0 ? JSON.stringify(nextNotes) : null,
    hadFinancing,
    hadPromotion,
  };
};

const findConversationForExternalUser = async ({ ownerUserId, userId, platform }) => {
  const inboundChannel = normalizeInboundChannel(platform || "web");
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return null;

  const context = await ChannelConversationContext.findOne({
    where: {
      ownerUserId,
      externalUserId: normalizedUserId,
      channel: inboundChannel,
    },
    order: [["updatedAt", "DESC"]],
  });
  if (context?.conversationId) {
    const conv = await Conversation.findOne({
      where: { id: context.conversationId, ownerUserId },
    });
    if (conv) return conv;
  }

  const lead = await ClientLead.findOne({
    where: { ownerUserId, phone: normalizedUserId },
  });
  if (!lead) return null;

  const convByChannel = await Conversation.findOne({
    where: { ownerUserId, clientLeadId: lead.id, channel: inboundChannel },
    order: [["updatedAt", "DESC"]],
  });
  if (convByChannel) return convByChannel;

  return Conversation.findOne({
    where: { ownerUserId, clientLeadId: lead.id },
    order: [["updatedAt", "DESC"]],
  });
};

const findLeadForExternalUser = async ({ ownerUserId, userId, platform }) => {
  const conv = await findConversationForExternalUser({ ownerUserId, userId, platform });
  if (conv?.clientLeadId) {
    const lead = await ClientLead.findOne({
      where: { id: conv.clientLeadId, ownerUserId, ...visibleLeadStatusWhere() },
    });
    if (lead) return lead;
  }

  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return null;

  return ClientLead.findOne({
    where: { ownerUserId, phone: normalizedUserId, ...visibleLeadStatusWhere() },
  });
};

/** Reactiva el bot en CRM tras reset de sesion (revierte handoff de lead_capture). */
export const releaseBotControlForExternalUser = async ({ ownerUserId, userId, platform }) => {
  if (!ownerUserId) throw new ApiError(500, "owner user is not configured");
  const inboundChannel = normalizeInboundChannel(platform || "web");
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return { released: false, conversationId: null };
  }

  const conv = await findConversationForExternalUser({
    ownerUserId,
    userId: normalizedUserId,
    platform: inboundChannel,
  });
  if (!conv) {
    return { released: false, conversationId: null };
  }
  if (!conv.isHumanControlled) {
    return { released: false, conversationId: conv.id };
  }

  await conv.update({
    isHumanControlled: false,
    handoffAt: null,
    handoffByUserId: null,
  });
  await setBotSessionDisabled({
    userId: normalizedUserId,
    platform: inboundChannel,
    botDisabled: false,
  });

  return { released: true, conversationId: conv.id };
};

/** Limpia vehiculo de interes, financiamiento y promocion asociados al lead CRM. */
export const clearLeadCommercialAssociationsForExternalUser = async ({ ownerUserId, userId, platform }) => {
  const defaultDetails = { vehicle: false, financing: false, promotion: false };
  const emptyResult = { cleared: false, clientLeadId: null, details: defaultDetails };

  if (!ownerUserId) throw new ApiError(500, "owner user is not configured");
  const inboundChannel = normalizeInboundChannel(platform || "web");
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return emptyResult;

  const lead = await findLeadForExternalUser({
    ownerUserId,
    userId: normalizedUserId,
    platform: inboundChannel,
  });
  if (!lead) return emptyResult;

  const hadVehicle = Boolean(String(lead.interestedIn || "").trim());
  const { notes: newNotes, hadFinancing, hadPromotion } = buildNotesWithoutCommercialSelections(lead.notes);
  const hadAnything = hadVehicle || hadFinancing || hadPromotion;
  if (!hadAnything) {
    return { cleared: false, clientLeadId: lead.id, details: defaultDetails };
  }

  await lead.update({
    interestedIn: "",
    notes: newNotes,
  });

  return {
    cleared: true,
    clientLeadId: lead.id,
    details: {
      vehicle: hadVehicle,
      financing: hadFinancing,
      promotion: hadPromotion,
    },
  };
};
