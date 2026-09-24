import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import {
  extractTemplateStatusUpdates,
  getMetaWhatsappWebhook,
  handleMetaWhatsappWebhookBody,
  postMetaWhatsappWebhook,
} from "./whatsappCloudWebhookController.js";

const originalToken = env.meta.webhookVerifyToken;
const originalWebhookEnabled = env.meta.webhookEnabled;

const mockRes = () => {
  const res = {
    statusCode: null,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
      this.body = undefined;
      return this;
    },
  };
  return res;
};

const templateStatusValue = {
  event: "APPROVED",
  message_template_id: "123",
  message_template_name: "cab_sg_abcd1234",
  message_template_language: "es_MX",
  reason: null,
};

const templateStatusPayload = () => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "message_template_status_update",
          value: { ...templateStatusValue },
        },
      ],
    },
  ],
});

const inboundMessageChange = {
  field: "messages",
  value: {
    messaging_product: "whatsapp",
    metadata: { display_phone_number: "15550001234", phone_number_id: "PNID" },
    messages: [
      {
        from: "5215512345678",
        id: "wamid.ABC",
        timestamp: "1700000000",
        type: "text",
        text: { body: "Hola" },
      },
    ],
  },
};

const mixedPayload = () => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "message_template_status_update",
          value: { ...templateStatusValue },
        },
        inboundMessageChange,
      ],
    },
  ],
});

const throwNext = (err) => {
  if (err) throw err;
};

test.afterEach(() => {
  env.meta.webhookVerifyToken = originalToken;
  env.meta.webhookEnabled = originalWebhookEnabled;
});

test("GET challenge devuelve hub.challenge cuando el token coincide", () => {
  env.meta.webhookVerifyToken = "verify-me";
  const req = {
    query: {
      "hub.mode": "subscribe",
      "hub.verify_token": "verify-me",
      "hub.challenge": "12345",
    },
  };
  const res = mockRes();
  getMetaWhatsappWebhook(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, "12345");
});

test("GET challenge responde 403 si el token no coincide", () => {
  env.meta.webhookVerifyToken = "verify-me";
  const req = {
    query: {
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong",
      "hub.challenge": "12345",
    },
  };
  const res = mockRes();
  getMetaWhatsappWebhook(req, res);
  assert.equal(res.statusCode, 403);
});

test("GET challenge responde 503 si el verify token no está configurado", () => {
  env.meta.webhookVerifyToken = "";
  const req = {
    query: {
      "hub.mode": "subscribe",
      "hub.verify_token": "anything",
      "hub.challenge": "12345",
    },
  };
  const res = mockRes();
  getMetaWhatsappWebhook(req, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body, "verify token not configured");
});

test("extractTemplateStatusUpdates extrae APPROVED sin exigir phone_number_id", () => {
  const updates = extractTemplateStatusUpdates(templateStatusPayload());
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    wabaId: "WABA_ID",
    metaTemplateId: "123",
    name: "cab_sg_abcd1234",
    language: "es_MX",
    event: "APPROVED",
    reason: null,
  });
  assert.equal("phone_number_id" in updates[0], false);
});

test("POST message_template_status_update aplica status y no ignora", async () => {
  env.meta.webhookEnabled = true;
  const applyCalls = [];
  const applyTemplateStatusUpdate = async (update) => {
    applyCalls.push(update);
    return { processed: true, reason: "template_status_updated" };
  };

  const payload = await handleMetaWhatsappWebhookBody(templateStatusPayload(), {
    applyTemplateStatusUpdate,
  });
  assert.equal(payload.ok, true);
  assert.notEqual(payload.ignored, true);
  assert.equal(payload.templateUpdates, 1);
  assert.equal(payload.processed, 0);
  assert.equal(applyCalls.length, 1);
  assert.equal(applyCalls[0].wabaId, "WABA_ID");
  assert.equal(applyCalls[0].metaTemplateId, "123");
  assert.equal(applyCalls[0].name, "cab_sg_abcd1234");
  assert.equal(applyCalls[0].language, "es_MX");
  assert.equal(applyCalls[0].event, "APPROVED");
  assert.equal(applyCalls[0].reason, null);

  const res = mockRes();
  await postMetaWhatsappWebhook({ body: templateStatusPayload() }, res, throwNext, {
    applyTemplateStatusUpdate,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.notEqual(res.body.ignored, true);
  assert.equal(res.body.templateUpdates, 1);
  assert.equal(applyCalls.length, 2);
});

test("POST solo template status no exige phone_number_id ni ingest", async () => {
  env.meta.webhookEnabled = true;
  let ingestCalled = false;
  let resolveCalled = false;
  const payload = await handleMetaWhatsappWebhookBody(templateStatusPayload(), {
    applyTemplateStatusUpdate: async () => ({ processed: true }),
    resolveMetaWhatsappByPhoneNumberId: async () => {
      resolveCalled = true;
      throw new Error("no debe resolver phone_number_id");
    },
    ingestWhatsappCloudEvent: async () => {
      ingestCalled = true;
      throw new Error("no debe ingest inbound");
    },
  });
  assert.equal(payload.ok, true);
  assert.notEqual(payload.ignored, true);
  assert.equal(resolveCalled, false);
  assert.equal(ingestCalled, false);
});

test("POST mixto (mensaje + status) procesa ambos", async () => {
  env.meta.webhookEnabled = true;
  const applyCalls = [];
  const ingestCalls = [];
  const result = await handleMetaWhatsappWebhookBody(mixedPayload(), {
    applyTemplateStatusUpdate: async (update) => {
      applyCalls.push(update);
      return { processed: true, reason: "template_status_updated" };
    },
    resolveMetaWhatsappByPhoneNumberId: async ({ phoneNumberId }) => ({
      integration: { id: "int-1", ownerUserId: "owner-1", phoneNumberId },
      credentials: { phoneNumberId, accessToken: "tok" },
    }),
    ingestWhatsappCloudEvent: async (args) => {
      ingestCalls.push(args);
      return { ok: true, ingested: true };
    },
  });
  assert.equal(result.ok, true);
  assert.notEqual(result.ignored, true);
  assert.equal(result.templateUpdates, 1);
  assert.equal(result.processed, 1);
  assert.equal(applyCalls.length, 1);
  assert.equal(applyCalls[0].event, "APPROVED");
  assert.equal(ingestCalls.length, 1);
  assert.equal(ingestCalls[0].normalizedEvent.eventId, "wamid.ABC");
  assert.deepEqual(result.results, [{ ok: true, ingested: true }]);
});

test("POST sin mensajes ni template status sigue ignored", async () => {
  env.meta.webhookEnabled = true;
  const res = mockRes();
  await postMetaWhatsappWebhook({ body: { object: "whatsapp_business_account", entry: [] } }, res, throwNext);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, ignored: true });
});
