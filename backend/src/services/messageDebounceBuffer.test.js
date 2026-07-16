import test from "node:test";
import assert from "node:assert/strict";
import {
  debounceAndFlush,
  _resetMessageDebounceBufferForTests,
} from "./messageDebounceBuffer.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test.beforeEach(() => {
  _resetMessageDebounceBufferForTests();
});

test.afterEach(() => {
  _resetMessageDebounceBufferForTests();
});

test("un mensaje → un flush con ese texto", async () => {
  const calls = [];
  const flush = async ({ message, adContext }) => {
    calls.push({ message, adContext });
    return [{ type: "text", text: "ok" }];
  };

  const result = await debounceAndFlush({
    key: "owner:whatsapp:user1",
    message: "Hola",
    flush,
    delayMs: 30,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].message, "Hola");
  assert.equal(result.isFlushLeader, true);
  assert.equal(result.joinedMessage, "Hola");
  assert.deepEqual(result.botReplies, [{ type: "text", text: "ok" }]);
});

test("tres mensajes dentro de la ventana → un flush concatenado", async () => {
  const calls = [];
  const flush = async ({ message }) => {
    calls.push(message);
    return [];
  };

  const p1 = debounceAndFlush({
    key: "owner:whatsapp:user2",
    message: "Quiero más información",
    flush,
    delayMs: 50,
  });
  await delay(10);
  const p2 = debounceAndFlush({
    key: "owner:whatsapp:user2",
    message: "Hola",
    flush,
    delayMs: 50,
  });
  await delay(10);
  const p3 = debounceAndFlush({
    key: "owner:whatsapp:user2",
    message: "Buen día",
    flush,
    delayMs: 50,
  });

  const results = await Promise.all([p1, p2, p3]);

  assert.equal(calls.length, 1);
  assert.equal(calls[0], "Quiero más información\nHola\nBuen día");
  assert.equal(results[0].isFlushLeader, true);
  assert.equal(results[1].isFlushLeader, false);
  assert.equal(results[2].isFlushLeader, false);
  assert.ok(results.every((r) => r.joinedMessage === calls[0]));
});

test("mensaje tras el flush → segundo lote independiente", async () => {
  const calls = [];
  const flush = async ({ message }) => {
    calls.push(message);
    return [];
  };

  await debounceAndFlush({
    key: "owner:whatsapp:user3",
    message: "primero",
    flush,
    delayMs: 30,
  });

  await debounceAndFlush({
    key: "owner:whatsapp:user3",
    message: "segundo",
    flush,
    delayMs: 30,
  });

  assert.deepEqual(calls, ["primero", "segundo"]);
});

test("usa el flush del primer webhook del lote, no el del último", async () => {
  const calls = [];
  const makeFlush = (conversationId) => async ({ message }) => {
    calls.push({ conversationId, message });
    return [];
  };

  const p1 = debounceAndFlush({
    key: "owner:whatsapp:user4b",
    message: "primero",
    flush: makeFlush("conv-first"),
    delayMs: 40,
  });
  await delay(5);
  const p2 = debounceAndFlush({
    key: "owner:whatsapp:user4b",
    message: "segundo",
    flush: makeFlush("conv-last"),
    delayMs: 40,
  });

  await Promise.all([p1, p2]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].conversationId, "conv-first");
  assert.equal(calls[0].message, "primero\nsegundo");
});

test("conserva el primer adContext no nulo del lote", async () => {
  const calls = [];
  const flush = async ({ message, adContext }) => {
    calls.push({ message, adContext });
    return [];
  };

  const ad = { sourceId: "ad-1", isAd: true };
  const p1 = debounceAndFlush({
    key: "owner:whatsapp:user4",
    message: "a",
    adContext: ad,
    flush,
    delayMs: 40,
  });
  await delay(5);
  const p2 = debounceAndFlush({
    key: "owner:whatsapp:user4",
    message: "b",
    adContext: { sourceId: "ad-2", isAd: true },
    flush,
    delayMs: 40,
  });

  await Promise.all([p1, p2]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].adContext, ad);
});

test("mensajes durante flush se encolan en un nuevo lote tras el mutex", async () => {
  const calls = [];
  let releaseFlush;
  const flushGate = new Promise((resolve) => {
    releaseFlush = resolve;
  });

  const flush = async ({ message }) => {
    calls.push(message);
    if (calls.length === 1) {
      await flushGate;
    }
    return [];
  };

  const first = debounceAndFlush({
    key: "owner:whatsapp:user5",
    message: "lote-1",
    flush,
    delayMs: 20,
  });

  await delay(30);
  assert.equal(calls.length, 1);

  const second = debounceAndFlush({
    key: "owner:whatsapp:user5",
    message: "lote-2",
    flush,
    delayMs: 20,
  });

  releaseFlush();
  await first;
  await second;

  assert.deepEqual(calls, ["lote-1", "lote-2"]);
});

test("rechaza key vacía", async () => {
  await assert.rejects(
    () =>
      debounceAndFlush({
        key: "  ",
        message: "x",
        flush: async () => [],
        delayMs: 10,
      }),
    /non-empty key/
  );
});
