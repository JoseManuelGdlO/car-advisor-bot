import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import { logWcWebhook } from "../utils/wcWebhookLog.js";

const BOT_MESSAGE_SEPARATOR = "\n\n<<BOT_MSG_BREAK>>\n\n";
const WC_IMAGE_MARKER_PREFIX = "<<WC_IMAGE_JSON>>";

const botEngineBaseUrl = () => String(env.bot.engineUrl || "").replace(/\/$/, "");

export const runBotChat = async ({ userId, platform, message }) => {
  // Wrapper del endpoint /chat para desacoplar la orquestación del controlador HTTP.
  const base = botEngineBaseUrl();
  if (!base) throw new ApiError(500, "BOT_ENGINE_URL is not configured");
  const response = await fetch(`${base}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: String(userId || "").trim(),
      platform: String(platform || "web").trim().toLowerCase(),
      message: String(message || "").trim(),
    }),
  }).catch((err) => {
    logWcWebhook("bot engine: network error", { message: err?.message || String(err) });
    throw new ApiError(502, "Could not reach bot engine");
  });

  const text = await response.text();
  if (!response.ok) {
    logWcWebhook("bot engine: bad response", {
      status: response.status,
      bodyPreview: String(text).slice(0, 300),
    });
    throw new ApiError(response.status >= 500 ? 502 : response.status, "Bot chat failed");
  }
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(502, "Invalid response from bot engine");
  }

  const reply = String(payload.reply || "").trim();
  if (!reply) return [];
  const parts = reply
    .split(BOT_MESSAGE_SEPARATOR)
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  const normalizedMessages = [];
  for (const part of parts) {
    const lines = part.split("\n");
    const textLines = [];
    for (const line of lines) {
      const trimmed = String(line || "").trim();
      if (!trimmed) continue;
      if (!trimmed.startsWith(WC_IMAGE_MARKER_PREFIX)) {
        textLines.push(trimmed);
        continue;
      }
      const rawJson = trimmed.slice(WC_IMAGE_MARKER_PREFIX.length);
      try {
        const parsed = JSON.parse(rawJson);
        const imageUrl = String(parsed?.imageUrl || "").trim();
        if (!imageUrl) continue;
        normalizedMessages.push({
          type: "image",
          imageUrl,
          caption: String(parsed?.caption || "").trim(),
        });
      } catch {
        textLines.push(trimmed);
      }
    }

    const text = textLines.join("\n").trim();
    if (text) {
      normalizedMessages.push({ type: "text", text });
    }
  }
  return normalizedMessages;
};
