import { z } from "zod";
import { ChannelConversationContext, ClientLead, Conversation, Message, User } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { setBotSessionDisabled } from "../services/botEngineClient.js";
import { sendConversationAttachmentMessage, sendConversationTextMessage } from "../services/conversationService.js";
import { normalizeInboundChannel } from "../utils/integrationChannel.js";
import { normalizePublicImageUrl } from "../utils/publicUrl.js";
import { isSellerAuth, leadVisibilityWhere, resolveTenantOwnerId } from "../utils/tenantAccess.js";

// Scope multi-tenant: siempre el tenant (admin), nunca el id del vendedor.
const ownerWhere = (userId) => ({ ownerUserId: userId });

/**
 * Include del lead de la conversación. Para vendedores restringe a leads asignados a él
 * (required => la conversación no aparece si el lead no es suyo).
 */
export const conversationClientInclude = (auth) => {
  const include = [{ model: User, as: "assignedSeller", attributes: ["id", "name"], required: false }];
  if (isSellerAuth(auth)) {
    const { assignedSellerUserId } = leadVisibilityWhere(auth);
    return { model: ClientLead, as: "client", where: { assignedSellerUserId }, required: true, include };
  }
  return { model: ClientLead, as: "client", include };
};

const findVisibleConversationOr404 = async (req, conversationId) => {
  const conv = await Conversation.findOne({
    where: { id: conversationId, ...ownerWhere(resolveTenantOwnerId(req)) },
    include: [conversationClientInclude(req.auth)],
  });
  if (!conv) throw new ApiError(404, "Conversation not found");
  return conv;
};

export const listConversations = async (req, res) => {
  // Lista conversaciones con datos del lead asociado para render de bandeja.
  const rows = await Conversation.findAll({
    where: ownerWhere(resolveTenantOwnerId(req)),
    include: [conversationClientInclude(req.auth)],
    order: [["updatedAt", "DESC"]],
  });
  return res.json(rows);
};

export const getConversationMessages = async (req, res) => {
  // Retorna timeline de mensajes ordenada cronológicamente.
  const conv = await findVisibleConversationOr404(req, req.params.id);
  const messages = await Message.findAll({
    where: { ownerUserId: conv.ownerUserId, conversationId: conv.id },
    order: [["createdAt", "ASC"]],
  });
  return res.json(messages);
};

export const sendMessageSchema = z.object({
  text: z.string().min(1).max(4000),
});

export const sendConversationMessage = async (req, res) => {
  const { text } = sendMessageSchema.parse(req.body || {});
  await findVisibleConversationOr404(req, req.params.id);
  const message = await sendConversationTextMessage({
    ownerUserId: resolveTenantOwnerId(req),
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
  const conv = await findVisibleConversationOr404(req, req.params.id);
  await conv.update({
    isHumanControlled,
    handoffAt: isHumanControlled ? new Date() : null,
    handoffByUserId: isHumanControlled ? req.auth.userId : null,
  });

  const context = await ChannelConversationContext.findOne({
    where: { ownerUserId: conv.ownerUserId, conversationId: conv.id },
    order: [["updatedAt", "DESC"]],
  });
  const userId = String(context?.externalUserId || conv.client?.phone || "").trim();
  const platform = normalizeInboundChannel(conv.channel || "web");
  if (userId) {
    await setBotSessionDisabled({
      userId,
      platform,
      botDisabled: isHumanControlled,
    });
  }

  return res.json(conv);
};

export const sendConversationAttachment = async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, "attachment file is required");
  const caption = String(req.body?.caption || "").trim();
  const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
  const host = req.get("x-forwarded-host") || req.get("host");
  if (!host) throw new ApiError(400, "Unable to build attachment URL");
  const fallbackBase = `${protocol}://${host}`;
  const imageUrl = normalizePublicImageUrl(`/uploads/autobot/${file.filename}`, { fallbackBase });
  await findVisibleConversationOr404(req, req.params.id);
  const message = await sendConversationAttachmentMessage({
    ownerUserId: resolveTenantOwnerId(req),
    conversationId: req.params.id,
    imageUrl,
    caption,
  });
  return res.status(201).json(message);
};
