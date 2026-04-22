import { ClientLead, Conversation, Message } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { isWithinBotSchedule } from "../utils/botSettings.js";
import { channelAllowsAutoReply, normalizeInboundChannel } from "../utils/integrationChannel.js";
import { env } from "../config/env.js";
import { getOrCreateBotSettings } from "../services/botSettingsService.js";

export const botUpsertConversation = async (req, res) => {
  const { user_id, platform, message, selected_car, customer_info } = req.body;
  const ownerUserId = env.bot.defaultOwnerUserId || req.auth.userId;
  const resolvedChannel = normalizeInboundChannel(platform || env.bot.defaultInboundChannel || "web");
  const inboundChannel = resolvedChannel;
  const messageFrom = String(req.body.from || "client").trim().toLowerCase();
  const normalizedUserId = String(user_id || "").trim();
  const normalizedMessage = String(message || "").trim();
  const normalizedPlatform = resolvedChannel;
  const normalizedFrom = ["client", "bot", "seller", "user", "assistant", "system"].includes(messageFrom) ? messageFrom : "client";
  const isInboundClientMessage = normalizedFrom === "client" || normalizedFrom === "user";
  console.log("[botUpsertConversation] inbound event", {
    user_id: normalizedUserId,
    platform: normalizedPlatform,
    from: normalizedFrom,
  });
  if (!ownerUserId) {
    console.error("[botUpsertConversation] Missing owner user id. Configure BOT_DEFAULT_OWNER_USER_ID or service token owner.");
    throw new ApiError(500, "owner user is not configured");
  }
  if (!normalizedUserId) {
    throw new ApiError(400, "user_id is required");
  }
  if (!normalizedMessage) {
    throw new ApiError(400, "message is required");
  }
  const botSettings = await getOrCreateBotSettings(ownerUserId);
  const scheduleOk = isWithinBotSchedule({
    isEnabled: botSettings.isEnabled,
    timezone: botSettings.timezone,
    weeklySchedule: botSettings.weeklySchedule,
  });
  const integrationOk = await channelAllowsAutoReply(ownerUserId, normalizedPlatform);
  const shouldAutoReply = scheduleOk && integrationOk;
  const [lead] = await ClientLead.findOrCreate({
    where: { ownerUserId, phone: customer_info?.telefono || normalizedUserId },
    defaults: {
      ownerUserId,
      name: customer_info?.nombre || "Cliente web",
      phone: customer_info?.telefono || normalizedUserId,
      channel: inboundChannel,
      interestedIn: selected_car || "",
      status: "lead",
      lastMessage: isInboundClientMessage ? normalizedMessage : "",
      lastMessageAt: isInboundClientMessage ? new Date() : null,
    },
  });
  await lead.update({
    interestedIn: selected_car || lead.interestedIn,
    lastMessage: isInboundClientMessage ? normalizedMessage : lead.lastMessage,
    lastMessageAt: isInboundClientMessage ? new Date() : lead.lastMessageAt,
    notes: customer_info ? JSON.stringify(customer_info) : lead.notes,
  });
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
  await conv.update({
    lastMessage: isInboundClientMessage ? normalizedMessage : conv.lastMessage,
    lastTime: isInboundClientMessage ? new Date() : conv.lastTime,
  });
  await Message.create({
    ownerUserId,
    conversationId: conv.id,
    from: normalizedFrom,
    text: normalizedMessage,
    platform: normalizedPlatform,
    phone: normalizedUserId,
    time: new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  });
  console.log("[botUpsertConversation] persisted message", {
    conversationId: conv.id,
    leadId: lead.id,
    from: normalizedFrom,
    shouldAutoReply,
  });
  let suppressedReason;
  if (!shouldAutoReply) {
    if (!scheduleOk) suppressedReason = "schedule_or_disabled";
    else if (!integrationOk) suppressedReason = "integration";
  }
  return res.status(201).json({
    ok: true,
    conversationId: conv.id,
    clientId: lead.id,
    shouldAutoReply,
    botSuppressed: !shouldAutoReply,
    suppressedReason,
    ownerUserId,
  });
};
