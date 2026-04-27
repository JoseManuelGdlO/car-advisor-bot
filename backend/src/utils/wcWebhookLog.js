import { env } from "../config/env.js";

// `npm test` usa NODE_ENV=test para no ensuciar la salida de assert.
const quietTest = process.env.NODE_ENV === "test";

/**
 * Logs operativos del webhook WC (visibles en prod; sin secretos).
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
export const logWcWebhook = (message, meta = {}) => {
  if (quietTest) return;
  console.log(`[wc-webhook] ${message}`, meta);
};

/**
 * Logs detallados solo con WC_WEBHOOK_DEBUG=true (payloads, stacks).
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
export const logWcWebhookDebug = (message, meta = {}) => {
  if (!env.wc.webhookDebug) return;
  if (quietTest) return;
  console.log(`[wc-webhook:debug] ${message}`, meta);
};
