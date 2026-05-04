/**
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
export const logIgWebhook = (message, meta = {}) => {
  console.log(`[ig-webhook] ${message}`, meta);
};

/**
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
export const logIgWebhookDebug = (message, meta = {}) => {
  if (process.env.META_WEBHOOK_DEBUG === "true") {
    console.log(`[ig-webhook:debug] ${message}`, meta);
  }
};
