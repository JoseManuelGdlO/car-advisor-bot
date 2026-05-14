import { env } from "../config/env.js";

const quietTest = process.env.NODE_ENV === "test";

const formatMeta = (meta) => {
  const keys = Object.keys(meta || {});
  if (!keys.length) return "";
  return keys
    .map((k) => {
      const val = meta[k];
      const primitive =
        typeof val === "string" || typeof val === "number" || typeof val === "boolean";
      const s = primitive ? String(val) : JSON.stringify(val);
      return `${k}=${s}`;
    })
    .join(" ");
};

/**
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
export const logIgWebhook = (message, meta = {}) => {
  if (quietTest) return;
  const tail = formatMeta(meta);
  console.log(tail ? `[ig-webhook] ${message} ${tail}` : `[ig-webhook] ${message}`);
};

/**
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
export const logIgWebhookDebug = (message, meta = {}) => {
  if (env.logLevel !== "debug" || !env.meta.webhookDebug) return;
  if (quietTest) return;
  const tail = formatMeta(meta);
  console.log(tail ? `[ig-webhook:debug] ${message} ${tail}` : `[ig-webhook:debug] ${message}`);
};
