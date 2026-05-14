import { env } from "../config/env.js";

// `npm test` usa NODE_ENV=test para no ensuciar la salida de assert.
const quietTest = process.env.NODE_ENV === "test";

/** Una línea clave=valor para metadatos (sin objeto como segundo argumento a console). */
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
 * Logs operativos del webhook WC (visibles en prod; sin secretos).
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
export const logWcWebhook = (message, meta = {}) => {
  if (quietTest) return;
  const tail = formatMeta(meta);
  console.log(tail ? `[wc-webhook] ${message} ${tail}` : `[wc-webhook] ${message}`);
};

/**
 * Logs detallados con LOG_LEVEL=debug y WC_WEBHOOK_DEBUG=true.
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
export const logWcWebhookDebug = (message, meta = {}) => {
  if (env.logLevel !== "debug" || !env.wc.webhookDebug) return;
  if (quietTest) return;
  const tail = formatMeta(meta);
  console.log(tail ? `[wc-webhook:debug] ${message} ${tail}` : `[wc-webhook:debug] ${message}`);
};
