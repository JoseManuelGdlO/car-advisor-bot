import { Op, fn, col } from "sequelize";
import { ClientLead, Conversation, Faq, Message, Promotion, Vehicle, FinancingPlan, BotSetting } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { isWithinBotSchedule, normalizeBotSettingsPayload, normalizeWeeklySchedule, toBotSettingsDto } from "../utils/botSettings.js";
import { channelAllowsAutoReply, normalizeInboundChannel } from "../utils/integrationChannel.js";
import { env } from "../config/env.js";

const ownerWhere = (userId) => ({ ownerUserId: userId });
const DEFAULT_BOT_SETTINGS = {
  isEnabled: true,
  timezone: "America/Bogota",
  weeklySchedule: normalizeWeeklySchedule({
    monday: [{ start: "08:00", end: "18:00" }],
    tuesday: [{ start: "08:00", end: "18:00" }],
    wednesday: [{ start: "08:00", end: "18:00" }],
    thursday: [{ start: "08:00", end: "18:00" }],
    friday: [{ start: "08:00", end: "18:00" }],
    saturday: [],
    sunday: [],
  }),
};

const getOrCreateBotSettings = async (ownerUserId) => {
  const [row] = await BotSetting.findOrCreate({
    where: { ownerUserId },
    defaults: { ownerUserId, ...DEFAULT_BOT_SETTINGS },
  });
  return row;
};

export const getDashboard = async (req, res) => {
  const userId = req.auth.userId;
  const [activeChats, newLeads, conversions, waiting, topRows] = await Promise.all([
    Conversation.count({ where: ownerWhere(userId) }),
    ClientLead.count({ where: { ...ownerWhere(userId), status: "lead" } }),
    ClientLead.count({ where: { ...ownerWhere(userId), status: "sold" } }),
    Conversation.count({ where: { ...ownerWhere(userId), unread: { [Op.gt]: 0 } } }),
    ClientLead.findAll({
      where: ownerWhere(userId),
      attributes: ["interestedIn", [fn("COUNT", col("interested_in")), "queries"]],
      group: ["interested_in"],
      order: [[fn("COUNT", col("interested_in")), "DESC"]],
      limit: 5,
      raw: true,
    }),
  ]);
  return res.json({
    activeChats,
    newToday: 0,
    waiting,
    newLeads,
    newLeadsChange: 0,
    conversions,
    conversionsChange: 0,
    weeklyChats: [0, 0, 0, 0, 0, 0, activeChats],
    topProducts: topRows.map((x) => ({ name: x.interestedIn || "Sin dato", queries: Number(x.queries || 0) })),
  });
};

export const listClients = async (req, res) => {
  const rows = await ClientLead.findAll({ where: ownerWhere(req.auth.userId), order: [["updatedAt", "DESC"]] });
  return res.json(rows);
};
export const getClient = async (req, res, next) => {
  const row = await ClientLead.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "Client not found"));
  return res.json(row);
};
export const createClient = async (req, res) => {
  const row = await ClientLead.create({ ...req.body, ownerUserId: req.auth.userId });
  return res.status(201).json(row);
};

export const listConversations = async (req, res) => {
  const rows = await Conversation.findAll({
    where: ownerWhere(req.auth.userId),
    include: [{ model: ClientLead, as: "client" }],
    order: [["updatedAt", "DESC"]],
  });
  return res.json(rows);
};
export const getConversationMessages = async (req, res) => {
  const conv = await Conversation.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!conv) throw new ApiError(404, "Conversation not found");
  const messages = await Message.findAll({ where: { ownerUserId: req.auth.userId, conversationId: conv.id }, order: [["createdAt", "ASC"]] });
  return res.json(messages);
};

export const listVehicles = async (req, res) =>
  res.json(
    await Vehicle.findAll({
      where: ownerWhere(req.auth.userId),
      include: [{ model: FinancingPlan, as: "financingPlans", through: { attributes: ["customRate"] } }],
      order: [["outboundPriority", "DESC"], ["updatedAt", "DESC"]],
    })
  );
export const createVehicle = async (req, res) => res.status(201).json(await Vehicle.create({ ...req.body, ownerUserId: req.auth.userId }));
export const updateVehicle = async (req, res, next) => {
  const row = await Vehicle.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "Vehicle not found"));
  await row.update(req.body);
  return res.json(row);
};
export const uploadVehicleImages = async (req, res) => {
  const files = req.files || [];
  const imageUrls = files.map((file) => `/uploads/autobot/${file.filename}`);
  return res.status(201).json({ imageUrls });
};
export const listFaqs = async (req, res) => res.json(await Faq.findAll({ where: ownerWhere(req.auth.userId), order: [["updatedAt", "DESC"]] }));
export const createFaq = async (req, res) => res.status(201).json(await Faq.create({ ...req.body, ownerUserId: req.auth.userId }));
export const updateFaq = async (req, res, next) => {
  const row = await Faq.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "FAQ not found"));
  await row.update({ question: req.body.question, answer: req.body.answer });
  return res.json(row);
};
export const deleteFaq = async (req, res, next) => {
  const row = await Faq.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "FAQ not found"));
  await row.destroy();
  return res.status(204).send();
};
export const listPromotions = async (req, res) => res.json(await Promotion.findAll({ where: ownerWhere(req.auth.userId), order: [["updatedAt", "DESC"]] }));
export const createPromotion = async (req, res) => res.status(201).json(await Promotion.create({ ...req.body, ownerUserId: req.auth.userId }));
export const updatePromotion = async (req, res, next) => {
  const row = await Promotion.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "Promotion not found"));
  await row.update(req.body);
  return res.json(row);
};
export const togglePromotion = async (req, res, next) => {
  const p = await Promotion.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!p) return next(new ApiError(404, "Promotion not found"));
  await p.update({ active: !p.active });
  return res.json(p);
};

export const getBotSettings = async (req, res) => {
  const row = await getOrCreateBotSettings(req.auth.userId);
  return res.json(toBotSettingsDto(row));
};

export const upsertBotSettings = async (req, res) => {
  const row = await getOrCreateBotSettings(req.auth.userId);
  const updates = normalizeBotSettingsPayload(req.body || {});
  if (Object.keys(updates).length) {
    await row.update(updates);
  }
  return res.json(toBotSettingsDto(row));
};

export const botUpsertConversation = async (req, res) => {
  const { user_id, platform, message, selected_car, customer_info } = req.body;
  const ownerUserId = env.bot.defaultOwnerUserId || req.auth.userId;
  const inboundChannel = normalizeInboundChannel(platform || env.bot.defaultInboundChannel || "web");
  const messageFrom = String(req.body.from || "client").trim().toLowerCase();
  const normalizedUserId = String(user_id || "").trim();
  const normalizedMessage = String(message || "").trim();
  const normalizedPlatform = normalizeInboundChannel(platform || "web");
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
    defaults: { ownerUserId, clientLeadId: lead.id, channel: inboundChannel, lastMessage: normalizedMessage, lastTime: new Date(), unread: 0 },
  });
  await conv.update({
    lastMessage: normalizedMessage,
    lastTime: new Date(),
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
