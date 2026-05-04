import test from "node:test";
import assert from "node:assert/strict";
import { expandInstagramWebhookInboundMessages, toNormalizedInstagramInboundEvent } from "./instagramEventNormalizer.js";

test("expandInstagramWebhookInboundMessages ignora object distinto de instagram", () => {
  assert.deepEqual(expandInstagramWebhookInboundMessages({ object: "page", entry: [] }), []);
});

test("expandInstagramWebhookInboundMessages extrae texto y omite echo", () => {
  const body = {
    object: "instagram",
    entry: [
      {
        id: "17841400008460056",
        messaging: [
          {
            sender: { id: "987654" },
            recipient: { id: "17841400008460056" },
            timestamp: "1569266185677",
            message: { mid: "m_1", text: "hola", is_echo: true },
          },
          {
            sender: { id: "12345" },
            recipient: { id: "17841400008460056" },
            timestamp: 1569266185677,
            message: { mid: "m_2", text: "  hi  " },
          },
        ],
      },
    ],
  };
  const rows = expandInstagramWebhookInboundMessages(body);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].instagramBusinessAccountId, "17841400008460056");
  assert.equal(rows[0].senderId, "12345");
  assert.equal(rows[0].messageId, "m_2");
  assert.equal(rows[0].text, "hi");
});

test("toNormalizedInstagramInboundEvent mapea deviceId a pageId", () => {
  const integration = { id: "int-1", ownerUserId: "owner-1" };
  const credentials = { pageId: "PAGE99", pageAccessToken: "tok" };
  const event = {
    instagramBusinessAccountId: "178414",
    senderId: "user-ig",
    messageId: "mid-x",
    text: "ok",
    timestampMs: 1_700_000_000_000,
  };
  const n = toNormalizedInstagramInboundEvent({ integration, credentials, event });
  assert.equal(n.channel, "instagram");
  assert.equal(n.deviceId, "PAGE99");
  assert.equal(n.externalUserId, "user-ig");
  assert.equal(n.eventId, "mid-x");
});
