import { ApiError } from "../utils/errors.js";
import { normalizeInboundChannel } from "../utils/integrationChannel.js";
import { env } from "../config/env.js";
import { upsertConversationEvent } from "../services/conversationService.js";
import { appLog } from "../utils/appLogger.js";

// Obtiene URL base del motor de bot sin slash final.
const botEngineBaseUrl = () => String(env.bot.engineUrl || "").replace(/\/$/, "");

export const botResetConversation = async (req, res) => {
  // Reinicia la sesión conversacional en el motor del bot para un user_id + canal.
  // 1) normaliza inputs.
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
  appLog.info("botResetConversation", "ok");
  appLog.debug("botResetConversation", {
    status: data && typeof data === "object" ? String(data.status ?? "") : "",
    deleted_rows: data && typeof data === "object" ? String(data.deleted_rows ?? "") : "",
    user_id: data && typeof data === "object" ? String(data.user_id ?? "") : "",
  });
  return res.status(200).json(data);
};

export const botUpsertConversation = async (req, res) => {
  // Delega toda la lógica de persistencia a un servicio reutilizable por otros canales.
  // Este endpoint es la entrada oficial de eventos del bot/canales al CRM.
  const { user_id, platform, message, selected_car, customer_info, financing_selection, promotion_selection } = req.body;
  const ownerUserId = req.auth.userId || env.bot.defaultOwnerUserId;
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
