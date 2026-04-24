import { Op } from "sequelize";
import { ClientLead, Conversation, Message } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { isWithinBotSchedule } from "../utils/botSettings.js";
import { channelAllowsAutoReply, normalizeInboundChannel } from "../utils/integrationChannel.js";
import { env } from "../config/env.js";
import { getOrCreateBotSettings } from "../services/botSettingsService.js";

const botEngineBaseUrl = () => String(env.bot.engineUrl || "").replace(/\/$/, "");

const hasUsableCustomerInfo = (c) => {
  if (c == null || typeof c !== "object") return false;
  return Object.values(c).some((v) => v != null && String(v).trim() !== "");
};

const isNonEmptyObject = (o) => o && typeof o === "object" && Object.keys(o).length > 0;

export const botResetConversation = async (req, res) => {
  const normalizedUserId = String(req.body?.user_id || "").trim();
  const resolvedChannel = normalizeInboundChannel(req.body?.platform || env.bot.defaultInboundChannel || "web");
  console.log("[botResetConversation] request", {
    user_id: normalizedUserId,
    platform: resolvedChannel,
  });
  if (!normalizedUserId) {
    throw new ApiError(400, "user_id is required");
  }
  const base = botEngineBaseUrl();
  if (!base) {
    console.error("[botResetConversation] BOT_ENGINE_URL is empty");
    throw new ApiError(500, "BOT_ENGINE_URL is not configured");
  }
  const url = `${base}/reset`;
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: normalizedUserId,
        platform: resolvedChannel,
      }),
    });
  } catch (err) {
    console.error("[botResetConversation] fetch failed", err);
    throw new ApiError(502, "Could not reach bot engine");
  }
  const text = await response.text();
  if (!response.ok) {
    console.error("[botResetConversation] bot error", {
      status: response.status,
      body: text.slice(0, 400),
    });
    throw new ApiError(response.status >= 500 ? 502 : response.status, "Bot reset failed");
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("[botResetConversation] invalid JSON from bot", text.slice(0, 200));
    throw new ApiError(502, "Invalid response from bot engine");
  }
  console.log("[botResetConversation] ok", data);
  return res.status(200).json(data);
};

export const botUpsertConversation = async (req, res) => {
  const { user_id, platform, message, selected_car, customer_info, financing_selection } = req.body;
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

  // `phone` en el lead = id estable del chat (mismo `user_id` en todos los POST), no mezclar
  // con el telefono de contacto (ese va en notes.customer_info y/o actualiza `name` en fila).
  const contactDigits =
    customer_info?.telefono != null && String(customer_info.telefono).trim() ? String(customer_info.telefono).trim() : "";
  const leadPhoneKeys = [normalizedUserId];
  if (contactDigits && contactDigits !== normalizedUserId) {
    leadPhoneKeys.push(contactDigits);
  }

  let lead = await ClientLead.findOne({
    where: { ownerUserId, phone: { [Op.in]: leadPhoneKeys } },
  });
  if (!lead) {
    lead = await ClientLead.create({
      ownerUserId,
      name: (customer_info?.nombre && String(customer_info.nombre).trim()) || "Cliente web",
      phone: normalizedUserId,
      channel: inboundChannel,
      interestedIn: selected_car || "",
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
  let mergedCustomerInfo = hasUsableCustomerInfo(customer_info) ? { ...prevInfo, ...customer_info } : { ...prevInfo };
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
  const mergedFinancing = isNonEmptyObject(financing_selection) ? { ...prevFinancing, ...financing_selection } : { ...prevFinancing };
  const mergedNotes = {
    ...currentNotes,
    ...(Object.keys(mergedCustomerInfo).length ? { customer_info: mergedCustomerInfo } : {}),
    ...(Object.keys(mergedFinancing).length ? { financing_selection: mergedFinancing } : {}),
  };
  const leadFieldUpdates = {
    interestedIn: selected_car || lead.interestedIn,
    lastMessage: isInboundClientMessage ? normalizedMessage : lead.lastMessage,
    lastMessageAt: isInboundClientMessage ? new Date() : lead.lastMessageAt,
    notes: Object.keys(mergedNotes).length ? JSON.stringify(mergedNotes) : lead.notes,
  };
  if (String(lead.phone) !== String(normalizedUserId)) {
    leadFieldUpdates.phone = normalizedUserId;
  }
  if (hasUsableCustomerInfo(customer_info)) {
    const n = String(customer_info.nombre || "").trim();
    if (n) {
      leadFieldUpdates.name = n;
    }
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
