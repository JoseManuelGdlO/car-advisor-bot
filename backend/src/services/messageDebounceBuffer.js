import { env } from "../config/env.js";

/** @typedef {{ resolve: (value: unknown) => void, reject: (reason?: unknown) => void }} Waiter */

/**
 * Búfer in-memory por clave de sesión: agrupa mensajes rápidos y hace un solo flush
 * tras `delayMs` sin nuevos mensajes (debounce con reset).
 *
 * Solo el primer waiter del lote (`isFlushLeader`) debe enviar outbound.
 */

/** @type {Map<string, { messages: string[], adContext: unknown, flush: ((args: { message: string, adContext: unknown }) => Promise<unknown>) | null, waiters: Waiter[], timer: ReturnType<typeof setTimeout> | null }>} */
const buffers = new Map();

/** Promise que resuelve cuando termina el flush en curso para esa clave. */
/** @type {Map<string, Promise<void>>} */
const flushGates = new Map();

/**
 * @param {object} options
 * @param {string} options.key
 * @param {string} options.message
 * @param {unknown} [options.adContext]
 * @param {(args: { message: string, adContext: unknown }) => Promise<unknown>} options.flush
 * @param {number} [options.delayMs] — override para tests; por defecto env.bot.messageDebounceMs
 * @returns {Promise<{ isFlushLeader: boolean, botReplies: unknown, joinedMessage: string }>}
 */
export const debounceAndFlush = ({ key, message, adContext = null, flush, delayMs }) => {
  const sessionKey = String(key || "").trim();
  if (!sessionKey) {
    return Promise.reject(new Error("debounceAndFlush requires a non-empty key"));
  }

  const text = String(message ?? "").trim();
  const waitMs = Number.isFinite(delayMs) ? Number(delayMs) : env.bot.messageDebounceMs;

  return new Promise((resolve, reject) => {
    const enqueue = () => {
      let entry = buffers.get(sessionKey);
      if (!entry) {
        entry = { messages: [], adContext: null, flush: null, waiters: [], timer: null };
        buffers.set(sessionKey, entry);
      }

      if (text) {
        entry.messages.push(text);
      }
      if (adContext != null && entry.adContext == null) {
        entry.adContext = adContext;
      }
      if (!entry.flush) {
        entry.flush = flush;
      }
      entry.waiters.push({ resolve, reject });

      if (entry.timer) {
        clearTimeout(entry.timer);
      }

      entry.timer = setTimeout(() => {
        void runFlush(sessionKey);
      }, waitMs);
    };

    const gate = flushGates.get(sessionKey);
    if (gate) {
      gate.then(enqueue, enqueue);
    } else {
      enqueue();
    }
  });
};

/**
 * @param {string} sessionKey
 */
const runFlush = async (sessionKey) => {
  const entry = buffers.get(sessionKey);
  if (!entry) return;

  const flush = entry.flush;
  buffers.delete(sessionKey);
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }

  if (!flush) return;

  let releaseGate = () => {};
  const gate = new Promise((resolve) => {
    releaseGate = resolve;
  });
  flushGates.set(sessionKey, gate);

  const joinedMessage = entry.messages.join("\n");
  const batchAdContext = entry.adContext;
  const waiters = entry.waiters;

  try {
    const botReplies = await flush({ message: joinedMessage, adContext: batchAdContext });
    waiters.forEach((waiter, index) => {
      waiter.resolve({
        isFlushLeader: index === 0,
        botReplies,
        joinedMessage,
      });
    });
  } catch (error) {
    waiters.forEach((waiter) => waiter.reject(error));
  } finally {
    releaseGate();
    if (flushGates.get(sessionKey) === gate) {
      flushGates.delete(sessionKey);
    }
  }
};

/** Solo para tests: limpia estado in-memory. */
export const _resetMessageDebounceBufferForTests = () => {
  for (const entry of buffers.values()) {
    if (entry.timer) clearTimeout(entry.timer);
  }
  buffers.clear();
  flushGates.clear();
};
