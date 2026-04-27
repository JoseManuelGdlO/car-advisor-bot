import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";

const BOT_MESSAGE_SEPARATOR = "\n\n<<BOT_MSG_BREAK>>\n\n";

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
  }).catch(() => {
    throw new ApiError(502, "Could not reach bot engine");
  });

  const text = await response.text();
  if (!response.ok) {
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
  return reply
    .split(BOT_MESSAGE_SEPARATOR)
    .map((part) => String(part || "").trim())
    .filter(Boolean);
};
