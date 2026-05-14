import { env } from "../config/env.js";

// `npm test` usa NODE_ENV=test para no ensuciar la salida de assert.
const quietTest = process.env.NODE_ENV === "test";

const formatKv = (fields) =>
  Object.entries(fields)
    .filter(([, val]) => val !== undefined && val !== null)
    .map(([k, val]) => {
      const primitive =
        typeof val === "string" || typeof val === "number" || typeof val === "boolean";
      const s = primitive ? String(val) : JSON.stringify(val);
      return `${k}=${s}`;
    })
    .join(" ");

/**
 * Logs de aplicación en una sola línea (sin objeto serializado en INFO).
 * Nivel global: `LOG_LEVEL` en env (`info` | `debug`).
 */
export const appLog = {
  /**
   * @param {string} tag
   * @param {string} line
   */
  info(tag, line) {
    if (quietTest) return;
    console.log(`[${tag}] ${line}`);
  },

  /**
   * Emite solo si `LOG_LEVEL=debug`. Campos como `conversationId`, `user_id`, etc.
   * @param {string} tag
   * @param {Record<string, unknown>} fields
   */
  debug(tag, fields) {
    if (quietTest) return;
    if (env.logLevel !== "debug") return;
    console.log(`[${tag}] ${formatKv(fields)}`);
  },
};
