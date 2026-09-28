import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import {
  BlackListEntry,
  BotSetting,
  ChannelConversationContext,
  ChannelEventReceipt,
  ChannelIntegration,
  ClientLead,
  Conversation,
  Message,
  User,
  Vehicle,
} from "../models/index.js";
import { _resetMessageDebounceBufferForTests } from "./messageDebounceBuffer.js";
import {
  ingestWhatsappCloudEvent,
  UNSUPPORTED_INBOUND_OUTBOUND_REPLY,
} from "./whatsappCloudWebhookIngestionService.js";

const originalFetch = global.fetch;
const originalDebounceMs = env.bot.messageDebounceMs;
const originalEngineUrl = env.bot.engineUrl;
const originalGraphVersion = env.meta.graphApiVersion;
const originalTimeoutMs = env.meta.timeoutMs;

const originalReceiptCreate = ChannelEventReceipt.create;
const originalContextFindOne = ChannelConversationContext.findOne;
const originalContextUpsert = ChannelConversationContext.upsert;
const originalBlacklistFindOne = BlackListEntry.findOne;
const originalBotSettingFindOrCreate = BotSetting.findOrCreate;
const originalIntegrationFindOne = ChannelIntegration.findOne;
const originalLeadFindOne = ClientLead.findOne;
const originalLeadCreate = ClientLead.create;
const originalVehicleFindOne = Vehicle.findOne;
const originalVehicleFindAll = Vehicle.findAll;
const originalConversationFindOrCreate = Conversation.findOrCreate;
const originalMessageCreate = Message.create;
const originalUserFindByPk = User.findByPk;

const alwaysOnSettings = {
  isEnabled: true,
  timezone: "UTC",
  weeklySchedule: {
    monday: [{ start: "00:00", end: "23:59" }],
    tuesday: [{ start: "00:00", end: "23:59" }],
    wednesday: [{ start: "00:00", end: "23:59" }],
    thursday: [{ start: "00:00", end: "23:59" }],
    friday: [{ start: "00:00", end: "23:59" }],
    saturday: [{ start: "00:00", end: "23:59" }],
    sunday: [{ start: "00:00", end: "23:59" }],
  },
};

const credentials = { phoneNumberId: "PNID", accessToken: "tok" };

const baseEvent = {
  ownerUserId: "owner-1",
  integrationId: "int-1",
  eventId: "wamid.in",
  eventType: "message",
  isInboundMessage: true,
  text: "Hola",
  unsupportedMediaOnly: false,
  externalUserId: "5215512345678",
  displayPhone: "5215512345678",
  channel: "whatsapp",
  messageId: "wamid.in",
  deviceId: null,
  tenantId: null,
  adContext: null,
};

const stubPipelineDb = () => {
  ChannelEventReceipt.create = async (data) => ({
    id: "receipt-1",
    ...data,
    update: async (patch) => Object.assign(data, patch),
  });
  ChannelConversationContext.findOne = async () => null;
  ChannelConversationContext.upsert = async () => [{}, true];
  BlackListEntry.findOne = async () => null;
  BotSetting.findOrCreate = async () => [alwaysOnSettings];
  ChannelIntegration.findOne = async () => null;
  let lead = null;
  ClientLead.findOne = async () => lead;
  ClientLead.create = async (data) => {
    lead = {
      id: "lead-1",
      notes: null,
      interestedIn: "",
      lastMessage: "",
      lastMessageAt: null,
      ...data,
      update: async (patch) => Object.assign(lead, patch),
    };
    return lead;
  };
  Vehicle.findOne = async () => null;
  Vehicle.findAll = async () => [];
  const conv = {
    id: "conv-1",
    isHumanControlled: false,
    lastMessage: "",
    lastTime: null,
    update: async (patch) => Object.assign(conv, patch),
  };
  Conversation.findOrCreate = async () => [conv, true];
  Message.create = async (data) => ({ id: "msg-1", ...data });
  User.findByPk = async () => null;
};

test.beforeEach(() => {
  env.bot.messageDebounceMs = 0;
  env.bot.engineUrl = "http://bot.test";
  env.meta.graphApiVersion = "v21.0";
  env.meta.timeoutMs = 8000;
  stubPipelineDb();
});

test.afterEach(() => {
  global.fetch = originalFetch;
  env.bot.messageDebounceMs = originalDebounceMs;
  env.bot.engineUrl = originalEngineUrl;
  env.meta.graphApiVersion = originalGraphVersion;
  env.meta.timeoutMs = originalTimeoutMs;
  ChannelEventReceipt.create = originalReceiptCreate;
  ChannelConversationContext.findOne = originalContextFindOne;
  ChannelConversationContext.upsert = originalContextUpsert;
  BlackListEntry.findOne = originalBlacklistFindOne;
  BotSetting.findOrCreate = originalBotSettingFindOrCreate;
  ChannelIntegration.findOne = originalIntegrationFindOne;
  ClientLead.findOne = originalLeadFindOne;
  ClientLead.create = originalLeadCreate;
  Vehicle.findOne = originalVehicleFindOne;
  Vehicle.findAll = originalVehicleFindAll;
  Conversation.findOrCreate = originalConversationFindOrCreate;
  Message.create = originalMessageCreate;
  User.findByPk = originalUserFindByPk;
  _resetMessageDebounceBufferForTests();
});

test("texto inbound dispara sendWhatsappText (Graph POST /messages)", async () => {
  const graphBodies = [];
  const botCalls = [];
  global.fetch = async (url, options) => {
    const u = String(url);
    if (u.includes("/chat")) {
      botCalls.push(JSON.parse(String(options?.body || "{}")));
      return { ok: true, status: 200, text: async () => JSON.stringify({ reply: "Hola bot" }) };
    }
    if (u.includes("graph.facebook.com")) {
      graphBodies.push(JSON.parse(String(options?.body || "{}")));
      return { ok: true, status: 200, text: async () => JSON.stringify({ messages: [{ id: "wamid.out" }] }) };
    }
    throw new Error(`unexpected fetch ${u}`);
  };

  const result = await ingestWhatsappCloudEvent({
    normalizedEvent: { ...baseEvent, eventId: "wamid.text" },
    credentials,
  });

  assert.equal(result.ok, true);
  assert.equal(result.repliesSent, 1);
  assert.equal(botCalls.length, 1);
  assert.equal(botCalls[0].message, "Hola");
  assert.equal(graphBodies.length, 1);
  assert.equal(graphBodies[0].messaging_product, "whatsapp");
  assert.equal(graphBodies[0].to, "525512345678");
  assert.equal(graphBodies[0].type, "text");
  assert.equal(graphBodies[0].text.body, "Hola bot");
});

test("media no soportada responde el texto fijo y no llama al bot", async () => {
  const graphBodies = [];
  let botCalled = false;
  global.fetch = async (url, options) => {
    const u = String(url);
    if (u.includes("/chat")) {
      botCalled = true;
      return { ok: true, status: 200, text: async () => JSON.stringify({ reply: "no" }) };
    }
    if (u.includes("graph.facebook.com")) {
      graphBodies.push(JSON.parse(String(options?.body || "{}")));
      return { ok: true, status: 200, text: async () => JSON.stringify({ messages: [{ id: "wamid.out" }] }) };
    }
    throw new Error(`unexpected fetch ${u}`);
  };

  const result = await ingestWhatsappCloudEvent({
    normalizedEvent: {
      ...baseEvent,
      eventId: "wamid.media",
      text: "",
      unsupportedMediaOnly: true,
    },
    credentials,
  });

  assert.equal(result.ok, true);
  assert.equal(result.unsupportedMediaOnly, true);
  assert.equal(result.repliesSent, 1);
  assert.equal(botCalled, false);
  assert.equal(graphBodies.length, 1);
  assert.equal(graphBodies[0].type, "text");
  assert.equal(graphBodies[0].text.body, UNSUPPORTED_INBOUND_OUTBOUND_REPLY);
});

test("evento no inbound no envía a Graph", async () => {
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return { ok: true, status: 200, text: async () => "{}" };
  };

  const result = await ingestWhatsappCloudEvent({
    normalizedEvent: { ...baseEvent, eventId: "wamid.status", isInboundMessage: false },
    credentials,
  });

  assert.deepEqual(result, { ok: true, ignored: true });
  assert.equal(fetchCalled, false);
});
