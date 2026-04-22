import { ClientLead, Conversation, Message } from "../models/index.js";
import { ApiError } from "../utils/errors.js";

const ownerWhere = (userId) => ({ ownerUserId: userId });

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
