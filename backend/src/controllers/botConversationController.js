import { z } from "zod";
import { ApiError } from "../utils/errors.js";
import { normalizeInboundChannel } from "../utils/integrationChannel.js";
import { env } from "../config/env.js";
import { ChannelConversationContext, ClientLead, Conversation } from "../models/index.js";
import { setBotSessionDisabled } from "../services/botEngineClient.js";
import { releaseBotControlForExternalUser, clearLeadCommercialAssociationsForExternalUser, upsertConversationEvent } from "../services/conversationService.js";
import { appLog } from "../utils/appLogger.js";
import { resolveRequestOwner } from "../utils/resolveRequestOwner.js";

export const botSetControlSchema = z.object({
  isHumanControlled: z.boolean(),
});

export const botResetConversationSchema = z.object({
  user_id: z.string().min(1),
  platform: z.string().optional(),
  owner_user_id: z.string().uuid().optional(),
  resetAll: z.boolean().optional(),
});

// Obtiene URL base del motor de bot sin slash final.
const botEngineBaseUrl = () => String(env.bot.engineUrl || "").replace(/\/$/, "");

export const botResetConversation = async (req, res) => {
  // Reinicia la sesión conversacional en el motor del bot para un user_id + canal.
  // 1) normaliza inputs.
  const ownerUserId = resolveRequestOwner(req, { bodyField: "owner_user_id" });
  const resetAll = Boolean(req.body?.resetAll);
  const normalizedUserId = String(req.body?.user_id || "").trim();
  const resolvedChannel = normalizeInboundChannel(req.body?.platform || env.bot.defaultInboundChannel || "web");
  appLog.info(
    "botResetConversation",
    `request platform=${resolvedChannel}`,
  );
  appLog.debug("botResetConversation", { user_id: normalizedUserId });
  if (!normalizedUserId) {
    throw new ApiError(400, "user_id is required");
  }
  // 2) valida integración con motor externo.
  const base = botEngineBaseUrl();
  if (!base) {
    console.error("[botResetConversation] BOT_ENGINE_URL is empty");
    throw new ApiError(500, "BOT_ENGINE_URL is not configured");
  }
  const url = `${base}/reset`;
  let response;
  try {
    // 3) propaga reset hacia FastAPI.
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
    // 4) respuesta esperada: JSON.
    data = JSON.parse(text);
  } catch {
    console.error("[botResetConversation] invalid JSON from bot", text.slice(0, 200));
    throw new ApiError(502, "Invalid response from bot engine");
  }
  let botControlReleased = { released: false, conversationId: null };
  try {
    botControlReleased = await releaseBotControlForExternalUser({
      ownerUserId,
      userId: normalizedUserId,
      platform: resolvedChannel,
    });
  } catch (err) {
    console.error("[botResetConversation] release bot control failed", err);
  }
  let leadAssociationsCleared = {
    cleared: false,
    clientLeadId: null,
    details: { vehicle: false, financing: false, promotion: false },
  };
  if (resetAll) {
    try {
      leadAssociationsCleared = await clearLeadCommercialAssociationsForExternalUser({
        ownerUserId,
        userId: normalizedUserId,
        platform: resolvedChannel,
      });
    } catch (err) {
      console.error("[botResetConversation] clear lead associations failed", err);
    }
  }
  appLog.info("botResetConversation", "ok");
  appLog.debug("botResetConversation", {
    status: data && typeof data === "object" ? String(data.status ?? "") : "",
    deleted_rows: data && typeof data === "object" ? String(data.deleted_rows ?? "") : "",
    user_id: data && typeof data === "object" ? String(data.user_id ?? "") : "",
    bot_control_released: String(botControlReleased.released),
    conversation_id: botControlReleased.conversationId || "",
    reset_all: String(resetAll),
    lead_associations_cleared: String(leadAssociationsCleared.cleared),
    client_lead_id: leadAssociationsCleared.clientLeadId || "",
  });
  const responseBody = {
    ...(data && typeof data === "object" ? data : {}),
    bot_control_released: botControlReleased.released,
    conversation_id: botControlReleased.conversationId,
  };
  if (resetAll) {
    responseBody.reset_all = true;
    responseBody.lead_associations_cleared = leadAssociationsCleared.cleared;
    responseBody.client_lead_id = leadAssociationsCleared.clientLeadId;
    responseBody.cleared = leadAssociationsCleared.details;
  }
  return res.status(200).json(responseBody);
};

export const botUpsertConversation = async (req, res) => {
  // Delega toda la lógica de persistencia a un servicio reutilizable por otros canales.
  // Este endpoint es la entrada oficial de eventos del bot/canales al CRM.
  const { user_id, platform, message, selected_car, customer_info, financing_selection, promotion_selection } = req.body;
  const ownerUserId = resolveRequestOwner(req, { bodyField: "owner_user_id" });
  const normalizedPlatform = normalizeInboundChannel(platform || env.bot.defaultInboundChannel || "web");
  const from = String(req.body.from || "client").trim().toLowerCase();
  appLog.info(
    "botUpsertConversation",
    `inbound event platform=${normalizedPlatform} from=${from}`,
  );
  appLog.debug("botUpsertConversation", {
    user_id: String(user_id || "").trim(),
  });
  const result = await upsertConversationEvent({
    ownerUserId,
    userId: user_id,
    platform: normalizedPlatform,
    message,
    from: req.body.from,
    selectedCar: selected_car,
    customerInfo: customer_info,
    financingSelection: financing_selection,
    promotionSelection: promotion_selection,
  });
  appLog.info(
    "botUpsertConversation",
    `persisted message from=${from} shouldAutoReply=${result.shouldAutoReply}`,
  );
  appLog.debug("botUpsertConversation", {
    conversationId: result.conversationId,
    leadId: result.clientId,
    ownerUserId: ownerUserId || "",
  });
  return res.status(201).json({
    ok: true,
    ...result,
  });
};

export const botSetConversationControl = async (req, res) => {
  const { isHumanControlled } = botSetControlSchema.parse(req.body || {});
  const ownerUserId = resolveRequestOwner(req, { bodyField: "owner_user_id" });
  const conversationId = String(req.params.conversationId || "").trim();
  if (!conversationId) {
    throw new ApiError(400, "conversationId is required");
  }
  const conv = await Conversation.findOne({
    where: { id: conversationId, ownerUserId },
    include: [{ model: ClientLead, as: "client" }],
  });
  if (!conv) {
    throw new ApiError(404, "Conversation not found");
  }
  await conv.update({
    isHumanControlled,
    handoffAt: isHumanControlled ? new Date() : null,
    handoffByUserId: isHumanControlled ? req.auth.userId : null,
  });

  const context = await ChannelConversationContext.findOne({
    where: { ownerUserId, conversationId: conv.id },
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

  appLog.info(
    "botSetConversationControl",
    `conversationId=${conversationId} isHumanControlled=${isHumanControlled}`,
  );
  return res.json(conv);
};
