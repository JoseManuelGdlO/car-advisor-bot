import test from "node:test";
import assert from "node:assert/strict";
import { runBotChat } from "./botEngineClient.js";
import { env } from "../config/env.js";

const originalFetch = global.fetch;
const originalEngineUrl = env.bot.engineUrl;

test.afterEach(() => {
  global.fetch = originalFetch;
  env.bot.engineUrl = originalEngineUrl;
});

test("runBotChat parsea marcador de documento embebido", async () => {
  env.bot.engineUrl = "https://bot.example";

  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        reply: [
          "Respuesta de ficha.",
          '<<WC_DOCUMENT_JSON>>{"to":"5215512345678","type":"document","documentUrl":"https://example.com/ficha.pdf","fileName":"ficha.pdf","caption":"Aquí tienes la ficha técnica"}',
        ].join("\n\n<<BOT_MSG_BREAK>>\n\n"),
      }),
  });

  const messages = await runBotChat({
    userId: "5215512345678",
    platform: "whatsapp",
    message: "dame la ficha tecnica",
    ownerUserId: "owner-1",
  });

  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], { type: "text", text: "Respuesta de ficha." });
  assert.deepEqual(messages[1], {
    type: "document",
    documentUrl: "https://example.com/ficha.pdf",
    fileName: "ficha.pdf",
    caption: "Aquí tienes la ficha técnica",
  });
});

test("runBotChat incluye ad_context solo cuando isAd=true", async () => {
  env.bot.engineUrl = "https://bot.example";
  let capturedBody = null;

  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(String(options?.body || "{}"));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ reply: "ok" }),
    };
  };

  await runBotChat({
    userId: "5215512345678",
    platform: "whatsapp",
    message: "Hola! Quiero más información",
    ownerUserId: "owner-1",
    adContext: {
      isAd: true,
      title: "Nissan Versa 2020",
      body: "copy del anuncio",
      sourceId: null,
      sourceUrl: null,
      sourceApp: null,
      ctwaClid: "clid",
      mediaUrl: null,
      greetingMessageBody: null,
    },
  });

  assert.equal(capturedBody.ad_context?.isAd, true);
  assert.equal(capturedBody.ad_context?.title, "Nissan Versa 2020");

  await runBotChat({
    userId: "5215512345678",
    platform: "whatsapp",
    message: "hola",
    ownerUserId: "owner-1",
    adContext: null,
  });
  assert.equal(capturedBody.ad_context, undefined);
});
