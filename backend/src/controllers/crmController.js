import { Op, fn, col } from "sequelize";
import { ClientLead, Conversation, Faq, Message, Promotion, Vehicle } from "../models/index.js";
import { ApiError } from "../utils/errors.js";

const ownerWhere = (userId) => ({ ownerUserId: userId });

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

export const listVehicles = async (req, res) => res.json(await Vehicle.findAll({ where: ownerWhere(req.auth.userId), order: [["updatedAt", "DESC"]] }));
export const createVehicle = async (req, res) => res.status(201).json(await Vehicle.create({ ...req.body, ownerUserId: req.auth.userId }));
export const listFaqs = async (req, res) => res.json(await Faq.findAll({ where: ownerWhere(req.auth.userId), order: [["updatedAt", "DESC"]] }));
export const createFaq = async (req, res) => res.status(201).json(await Faq.create({ ...req.body, ownerUserId: req.auth.userId }));
export const listPromotions = async (req, res) => res.json(await Promotion.findAll({ where: ownerWhere(req.auth.userId), order: [["updatedAt", "DESC"]] }));
export const createPromotion = async (req, res) => res.status(201).json(await Promotion.create({ ...req.body, ownerUserId: req.auth.userId }));
export const togglePromotion = async (req, res, next) => {
  const p = await Promotion.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!p) return next(new ApiError(404, "Promotion not found"));
  await p.update({ active: !p.active });
  return res.json(p);
};

export const botUpsertConversation = async (req, res) => {
  const ownerUserId = req.auth.userId;
  const { user_id, platform, message, selected_car, customer_info } = req.body;
  const [lead] = await ClientLead.findOrCreate({
    where: { ownerUserId, phone: customer_info?.telefono || user_id },
    defaults: {
      ownerUserId,
      name: customer_info?.nombre || `Lead ${user_id}`,
      phone: customer_info?.telefono || user_id,
      channel: platform || "api",
      interestedIn: selected_car || "",
      status: "lead",
      lastMessage: message || "",
      lastMessageAt: new Date(),
    },
  });
  await lead.update({
    interestedIn: selected_car || lead.interestedIn,
    lastMessage: message || lead.lastMessage,
    lastMessageAt: new Date(),
    notes: customer_info ? JSON.stringify(customer_info) : lead.notes,
  });
  const [conv] = await Conversation.findOrCreate({
    where: { ownerUserId, clientLeadId: lead.id },
    defaults: { ownerUserId, clientLeadId: lead.id, channel: platform || "api", lastMessage: message || "", lastTime: new Date(), unread: 0 },
  });
  if (message) {
    await Message.create({
      ownerUserId,
      conversationId: conv.id,
      from: "bot",
      text: message,
      time: new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
    });
  }
  return res.status(201).json({ ok: true, conversationId: conv.id, clientId: lead.id });
};
