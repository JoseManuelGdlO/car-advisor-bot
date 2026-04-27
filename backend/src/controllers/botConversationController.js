import { ApiError } from "../utils/errors.js";
import { normalizeInboundChannel } from "../utils/integrationChannel.js";
import { env } from "../config/env.js";
import { upsertConversationEvent } from "../services/conversationService.js";

const botEngineBaseUrl = () => String(env.bot.engineUrl || "").replace(/\/$/, "");

export const botResetConversation = async (req, res) => {
  // Reinicia la sesión conversacional en el motor del bot para un user_id + canal.
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
  // Delega toda la lógica de persistencia a un servicio reutilizable por otros canales.
  const { user_id, platform, message, selected_car, customer_info, financing_selection } = req.body;
  const ownerUserId = env.bot.defaultOwnerUserId || req.auth.userId;
  const normalizedPlatform = normalizeInboundChannel(platform || env.bot.defaultInboundChannel || "web");
  console.log("[botUpsertConversation] inbound event", {
    user_id: String(user_id || "").trim(),
    platform: normalizedPlatform,
    from: String(req.body.from || "client").trim().toLowerCase(),
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
  });
  console.log("[botUpsertConversation] persisted message", {
    conversationId: result.conversationId,
    leadId: result.clientId,
    from: String(req.body.from || "client").trim().toLowerCase(),
    shouldAutoReply: result.shouldAutoReply,
  });
  return res.status(201).json({
    ok: true,
    ...result,
  });
};
