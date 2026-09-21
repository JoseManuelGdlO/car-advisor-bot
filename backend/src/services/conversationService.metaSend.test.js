import test from "node:test";
import assert from "node:assert/strict";
import {
  ChannelConversationContext,
  ChannelCredential,
  ChannelIntegration,
  Conversation,
  Message,
} from "../models/index.js";
import { encryptCredentialsPayload } from "../utils/credentialsCrypto.js";
import { sendConversationAttachmentMessage, sendConversationTextMessage } from "./conversationService.js";
import { wcClient } from "./wcClient.js";

const originalConversationFindOne = Conversation.findOne;
const originalConversationUpdate = Conversation.update;
const originalContextFindOne = ChannelConversationContext.findOne;
const originalIntegrationFindByPk = ChannelIntegration.findByPk;
const originalIntegrationFindOne = ChannelIntegration.findOne;
const originalCredentialFindOne = ChannelCredential.findOne;
const originalMessageCreate = Message.create;
const originalWcSend = wcClient.sendMessageWithRetry;
const originalFetch = global.fetch;

const metaIntegration = {
  id: "int-meta",
  ownerUserId: "owner-1",
  channel: "whatsapp",
  provider: "meta",
  status: "active",
  phoneNumberId: "PNID",
};

const wcIntegration = {
  id: "int-wc",
  ownerUserId: "owner-1",
  channel: "whatsapp",
  provider: "whatsapp-connect",
  status: "active",
};

const conversationRow = {
  id: "conv-1",
  channel: "whatsapp",
  client: { phone: "5215512345678" },
};

test.afterEach(() => {
  Conversation.findOne = originalConversationFindOne;
  Conversation.update = originalConversationUpdate;
  ChannelConversationContext.findOne = originalContextFindOne;
  ChannelIntegration.findByPk = originalIntegrationFindByPk;
  ChannelIntegration.findOne = originalIntegrationFindOne;
  ChannelCredential.findOne = originalCredentialFindOne;
  Message.create = originalMessageCreate;
  wcClient.sendMessageWithRetry = originalWcSend;
  global.fetch = originalFetch;
});

const stubPersist = () => {
  Message.create = async (data) => ({ id: "msg-1", text: data.text, from: data.from });
  Conversation.update = async () => [1];
};

const stubOwnedWhatsapp = ({ integrationId, externalUserId = "5215512345678" }) => {
  Conversation.findOne = async () => conversationRow;
  ChannelConversationContext.findOne = async () => ({
    channelIntegrationId: integrationId,
    externalUserId,
    deviceId: "dev-1",
    tenantId: "tenant-1",
  });
};

test("sendConversationTextMessage usa Graph cuando provider es meta", async () => {
  stubOwnedWhatsapp({ integrationId: metaIntegration.id });
  stubPersist();
  ChannelIntegration.findByPk = async () => metaIntegration;
  ChannelIntegration.findOne = async () => metaIntegration;
  ChannelCredential.findOne = async () => ({
    cipherText: encryptCredentialsPayload({
      accessToken: "tok",
      phoneNumberId: "PNID",
    }),
  });

  let wcCalls = 0;
  wcClient.sendMessageWithRetry = async () => {
    wcCalls += 1;
    return { ok: true };
  };

  let calledUrl;
  let calledBody;
  global.fetch = async (url, options) => {
    calledUrl = String(url);
    calledBody = JSON.parse(String(options?.body || "{}"));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ messages: [{ id: "wamid.1" }] }),
    };
  };

  const msg = await sendConversationTextMessage({
    ownerUserId: "owner-1",
    conversationId: "conv-1",
    text: "Hola desde el asesor",
  });

  assert.equal(wcCalls, 0);
  assert.match(calledUrl, /\/PNID\/messages/);
  assert.equal(calledBody.messaging_product, "whatsapp");
  assert.equal(calledBody.to, "5215512345678");
  assert.equal(calledBody.type, "text");
  assert.equal(calledBody.text.body, "Hola desde el asesor");
  assert.equal(msg.text, "Hola desde el asesor");
});

test("sendConversationTextMessage usa WhatsApp Connect cuando provider no es meta", async () => {
  stubOwnedWhatsapp({ integrationId: wcIntegration.id });
  stubPersist();
  ChannelIntegration.findByPk = async () => wcIntegration;
  ChannelIntegration.findOne = async () => wcIntegration;
  ChannelCredential.findOne = async () => ({
    cipherText: encryptCredentialsPayload({
      webhookSecret: "secret",
      deviceId: "dev-1",
      tenantId: "tenant-1",
    }),
  });

  let graphCalls = 0;
  global.fetch = async () => {
    graphCalls += 1;
    return { ok: true, status: 200, text: async () => "{}" };
  };

  let wcPayload;
  wcClient.sendMessageWithRetry = async (params) => {
    wcPayload = params;
    return { ok: true };
  };

  await sendConversationTextMessage({
    ownerUserId: "owner-1",
    conversationId: "conv-1",
    text: "Hola WC",
  });

  assert.equal(graphCalls, 0);
  assert.deepEqual(wcPayload, {
    deviceId: "dev-1",
    to: "5215512345678",
    type: "text",
    text: "Hola WC",
    tenantId: "tenant-1",
  });
});

test("sendConversationAttachmentMessage usa Graph image cuando provider es meta", async () => {
  stubOwnedWhatsapp({ integrationId: metaIntegration.id });
  stubPersist();
  ChannelIntegration.findByPk = async () => metaIntegration;
  ChannelIntegration.findOne = async () => metaIntegration;
  ChannelCredential.findOne = async () => ({
    cipherText: encryptCredentialsPayload({
      accessToken: "tok",
      phoneNumberId: "PNID",
    }),
  });

  wcClient.sendMessageWithRetry = async () => {
    throw new Error("WC no debe usarse para Meta");
  };

  let calledBody;
  global.fetch = async (_url, options) => {
    calledBody = JSON.parse(String(options?.body || "{}"));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ messages: [{ id: "wamid.img" }] }),
    };
  };

  await sendConversationAttachmentMessage({
    ownerUserId: "owner-1",
    conversationId: "conv-1",
    imageUrl: "https://example.com/car.png",
    caption: "Imagen del vehiculo",
  });

  assert.equal(calledBody.type, "image");
  assert.deepEqual(calledBody.image, {
    link: "https://example.com/car.png",
    caption: "Imagen del vehiculo",
  });
});
