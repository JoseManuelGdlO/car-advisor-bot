import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";

const graphBase = () => {
  const v = String(env.meta.graphApiVersion || "v21.0").replace(/^\/+/, "");
  return `https://graph.facebook.com/${v}`;
};

/**
 * Envía un mensaje de texto por Instagram Messaging API (vía Page).
 * @param {{ pageId: string; pageAccessToken: string; recipientIgsid: string; text: string }} params
 */
export const sendInstagramTextMessage = async ({ pageId, pageAccessToken, recipientIgsid, text }) => {
  const pid = String(pageId || "").trim();
  const token = String(pageAccessToken || "").trim();
  const to = String(recipientIgsid || "").trim();
  const bodyText = String(text || "").trim();
  if (!pid || !token || !to || !bodyText) throw new ApiError(400, "Missing Instagram send parameters");

  const url = `${graphBase()}/${encodeURIComponent(pid)}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      recipient: { id: to },
      messaging_type: "RESPONSE",
      message: { text: bodyText },
    }),
  }).catch((err) => {
    throw new ApiError(502, `Instagram Graph network error: ${err?.message || String(err)}`);
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new ApiError(
      response.status >= 500 ? 502 : response.status,
      `Instagram Graph send failed: ${String(raw).slice(0, 400)}`
    );
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { raw };
  }
};
