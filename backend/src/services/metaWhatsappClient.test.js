import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import {
  sendWhatsappDocument,
  sendWhatsappImage,
  sendWhatsappTemplate,
  sendWhatsappText,
  sendWhatsappWithRetry,
} from "./metaWhatsappClient.js";

const originalFetch = global.fetch;
const originalTimeoutMs = env.meta.timeoutMs;
const originalGraphVersion = env.meta.graphApiVersion;
const originalTemplateLanguage = env.meta.templateLanguage;

test.afterEach(() => {
  global.fetch = originalFetch;
  env.meta.timeoutMs = originalTimeoutMs;
  env.meta.graphApiVersion = originalGraphVersion;
  env.meta.templateLanguage = originalTemplateLanguage;
});

const okResponse = (payload = { messages: [{ id: "wamid.1" }] }) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(payload),
});

test("sendWhatsappText POST /{phoneNumberId}/messages con messaging_product whatsapp", async () => {
  env.meta.graphApiVersion = "v21.0";
  let calledUrl;
  let calledMethod;
  let calledHeaders;
  let calledBody;
  global.fetch = async (url, options) => {
    calledUrl = String(url);
    calledMethod = options?.method;
    calledHeaders = options?.headers || {};
    calledBody = JSON.parse(String(options?.body || "{}"));
    return okResponse();
  };

  await sendWhatsappText({
    phoneNumberId: "PNID",
    accessToken: "tok",
    to: "5215512345678@s.whatsapp.net",
    text: "Hola",
  });

  assert.match(calledUrl, /\/PNID\/messages/);
  assert.match(calledUrl, /graph\.facebook\.com\/v21\.0\//);
  assert.equal(calledMethod, "POST");
  assert.equal(calledHeaders.Authorization, "Bearer tok");
  assert.equal(calledHeaders["Content-Type"], "application/json");
  assert.equal(calledBody.messaging_product, "whatsapp");
  assert.equal(calledBody.to, "525512345678");
  assert.equal(calledBody.type, "text");
  assert.equal(calledBody.text.body, "Hola");
});

test("Graph 400 con mensaje de 24 h lanza ApiError con texto usable", async () => {
  global.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () =>
      JSON.stringify({
        error: {
          message:
            "Message failed to send because more than 24 hours have passed since the customer last replied to this number.",
          code: 131047,
          error_user_title: "Re-engagement message",
        },
      }),
  });

  await assert.rejects(
    () =>
      sendWhatsappText({
        phoneNumberId: "PNID",
        accessToken: "tok",
        to: "5215512345678",
        text: "Hola",
      }),
    (err) =>
      err instanceof ApiError &&
      err.status === 400 &&
      /24 hours|24 horas|re-engagement/i.test(err.message)
  );
});

test("Graph 400 code 100 adjunta meta completo de Graph", async () => {
  global.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () =>
      JSON.stringify({
        error: {
          message: "(#100) Invalid parameter",
          type: "OAuthException",
          code: 100,
          error_subcode: 33,
          error_user_title: "Unsupported post request",
          error_data: { details: "Object with ID 'PNID' does not exist" },
          fbtrace_id: "AbC123",
          href: "https://developers.facebook.com/docs/graph-api/using-graph-api/error-handling/",
        },
      }),
  });

  await assert.rejects(
    () =>
      sendWhatsappText({
        phoneNumberId: "PNID",
        accessToken: "tok",
        to: "5215512345678",
        text: "Hola",
      }),
    (err) => {
      assert.equal(err instanceof ApiError, true);
      assert.equal(err.status, 400);
      assert.match(err.message, /configuración de la app/i);
      assert.equal(err.meta.code, 100);
      assert.equal(err.meta.subcode, 33);
      assert.equal(err.meta.type, "OAuthException");
      assert.equal(err.meta.title, "Unsupported post request");
      assert.equal(err.meta.message, "(#100) Invalid parameter");
      assert.match(err.meta.details, /does not exist/);
      assert.equal(err.meta.fbtraceId, "AbC123");
      assert.match(err.meta.href, /error-handling/);
      return true;
    }
  );
});

test("status 429 reintenta", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls < 2) {
      return {
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: "rate limit" } }),
      };
    }
    return okResponse();
  };

  await sendWhatsappText({
    phoneNumberId: "PNID",
    accessToken: "tok",
    to: "5215512345678",
    text: "Hola",
  });

  assert.equal(calls, 2);
});

test("sendWhatsappWithRetry reintenta 429 y 5xx y deja de reintentar en 400", async () => {
  let attempts = 0;
  const result = await sendWhatsappWithRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) throw new ApiError(429, "rate");
      if (attempts === 2) throw new ApiError(500, "upstream");
      return { ok: true };
    },
    { maxAttempts: 3, baseDelayMs: 1 }
  );
  assert.equal(result.ok, true);
  assert.equal(attempts, 3);

  await assert.rejects(
    () =>
      sendWhatsappWithRetry(
        async () => {
          throw new ApiError(400, "no retry");
        },
        { maxAttempts: 3, baseDelayMs: 1 }
      ),
    (err) => err instanceof ApiError && err.status === 400 && err.message === "no retry"
  );
});

test("sendWhatsappImage POST image.link y caption opcional", async () => {
  let calledBody;
  global.fetch = async (_url, options) => {
    calledBody = JSON.parse(String(options?.body || "{}"));
    return okResponse();
  };

  await sendWhatsappImage({
    phoneNumberId: "PNID",
    accessToken: "tok",
    to: "+52 155 1234 5678",
    imageUrl: "https://example.com/car.png",
    caption: "Imagen del vehiculo",
  });

  assert.equal(calledBody.messaging_product, "whatsapp");
  assert.equal(calledBody.to, "525512345678");
  assert.equal(calledBody.type, "image");
  assert.deepEqual(calledBody.image, {
    link: "https://example.com/car.png",
    caption: "Imagen del vehiculo",
  });
});

test("sendWhatsappDocument POST document.link filename y caption", async () => {
  let calledBody;
  global.fetch = async (_url, options) => {
    calledBody = JSON.parse(String(options?.body || "{}"));
    return okResponse();
  };

  await sendWhatsappDocument({
    phoneNumberId: "PNID",
    accessToken: "tok",
    to: "5215512345678",
    documentUrl: "https://example.com/ficha.pdf",
    fileName: "ficha.pdf",
    caption: "Ficha técnica",
  });

  assert.equal(calledBody.type, "document");
  assert.deepEqual(calledBody.document, {
    link: "https://example.com/ficha.pdf",
    filename: "ficha.pdf",
    caption: "Ficha técnica",
  });
});

test("sendWhatsappTemplate POST type=template sin components", async () => {
  env.meta.graphApiVersion = "v21.0";
  env.meta.templateLanguage = "es_MX";
  let calledUrl;
  let calledMethod;
  let calledHeaders;
  let calledBody;
  global.fetch = async (url, options) => {
    calledUrl = String(url);
    calledMethod = options?.method;
    calledHeaders = options?.headers || {};
    calledBody = JSON.parse(String(options?.body || "{}"));
    return okResponse();
  };

  await sendWhatsappTemplate({
    phoneNumberId: "PNID",
    accessToken: "tok",
    to: "5215512345678@s.whatsapp.net",
    name: "cab_sg_abcd1234",
  });

  assert.match(calledUrl, /\/PNID\/messages/);
  assert.match(calledUrl, /graph\.facebook\.com\/v21\.0\//);
  assert.equal(calledMethod, "POST");
  assert.equal(calledHeaders.Authorization, "Bearer tok");
  assert.equal(calledHeaders["Content-Type"], "application/json");
  assert.equal(calledBody.messaging_product, "whatsapp");
  assert.equal(calledBody.to, "525512345678");
  assert.equal(calledBody.type, "template");
  assert.deepEqual(calledBody.template, {
    name: "cab_sg_abcd1234",
    language: { code: "es_MX" },
  });
  assert.equal("components" in calledBody, false);
  assert.equal("components" in calledBody.template, false);
});

test("sendWhatsappTemplate exige name y to con ApiError 400 en español", async () => {
  await assert.rejects(
    () =>
      sendWhatsappTemplate({
        phoneNumberId: "PNID",
        accessToken: "tok",
        to: "5215512345678",
      }),
    (err) =>
      err instanceof ApiError &&
      err.status === 400 &&
      /nombre|plantilla/i.test(err.message)
  );

  await assert.rejects(
    () =>
      sendWhatsappTemplate({
        phoneNumberId: "PNID",
        accessToken: "tok",
        name: "cab_sg_abcd1234",
      }),
    (err) => err instanceof ApiError && err.status === 400 && /teléfono|telefono/i.test(err.message)
  );
});
