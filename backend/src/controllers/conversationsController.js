import { z } from "zod";
import { ClientLead, Conversation, Message } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { sendConversationAttachmentMessage, sendConversationTextMessage } from "../services/conversationService.js";

// Scope multi-tenant por propietario autenticado.
const ownerWhere = (userId) => ({ ownerUserId: userId });

export const listConversations = async (req, res) => {
  // Lista conversaciones con datos del lead asociado para render de bandeja.
  const rows = await Conversation.findAll({
    where: ownerWhere(req.auth.userId),
    include: [{ model: ClientLead, as: "client" }],
    order: [["updatedAt", "DESC"]],
  });
  return res.json(rows);
};

export const getConversationMessages = async (req, res) => {
  // Retorna timeline de mensajes ordenada cronológicamente.
  const conv = await Conversation.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!conv) throw new ApiError(404, "Conversation not found");
  const messages = await Message.findAll({ where: { ownerUserId: req.auth.userId, conversationId: conv.id }, order: [["createdAt", "ASC"]] });
  return res.json(messages);
};

export const sendMessageSchema = z.object({
  text: z.string().min(1).max(4000),
});

export const sendConversationMessage = async (req, res) => {
  const { text } = sendMessageSchema.parse(req.body || {});
  const message = await sendConversationTextMessage({
    ownerUserId: req.auth.userId,
    conversationId: req.params.id,
    text,
  });
  return res.status(201).json(message);
};

export const setControlSchema = z.object({
  isHumanControlled: z.boolean(),
});

export const setConversationControl = async (req, res) => {
  const { isHumanControlled } = setControlSchema.parse(req.body || {});
  const conv = await Conversation.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!conv) throw new ApiError(404, "Conversation not found");
  await conv.update({
    isHumanControlled,
    handoffAt: isHumanControlled ? new Date() : null,
    handoffByUserId: isHumanControlled ? req.auth.userId : null,
  });
  return res.json(conv);
};

export const sendConversationAttachment = async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, "attachment file is required");
  const caption = String(req.body?.caption || "").trim();
  const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
  const host = req.get("x-forwarded-host") || req.get("host");
  if (!host) throw new ApiError(400, "Unable to build attachment URL");
  const imageUrl = `${protocol}://${host}/uploads/autobot/${file.filename}`;
  const message = await sendConversationAttachmentMessage({
    ownerUserId: req.auth.userId,
    conversationId: req.params.id,
    imageUrl,
    caption,
  });
  return res.status(201).json(message);
};
