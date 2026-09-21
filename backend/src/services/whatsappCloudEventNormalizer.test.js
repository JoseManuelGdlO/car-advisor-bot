import test from "node:test";
import assert from "node:assert/strict";
import { formatCampaignCrmMessage } from "../utils/campaignCrmMessage.js";
import {
  expandWhatsappCloudInboundMessages,
  toNormalizedWhatsappCloudEvent,
} from "./whatsappCloudEventNormalizer.js";

const textFixture = () => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
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
        },
      ],
    },
  ],
});

const integration = { id: "int-1", ownerUserId: "owner-1", phoneNumberId: "PNID-INT" };
const credentials = { phoneNumberId: "PNID", accessToken: "tok" };

test("expandWhatsappCloudInboundMessages ignora object distinto de whatsapp_business_account", () => {
  assert.deepEqual(
    expandWhatsappCloudInboundMessages({ object: "instagram", entry: textFixture().entry }),
    []
  );
});

test("mensaje de texto usa body y dígitos Graph sin JID", () => {
  const rows = expandWhatsappCloudInboundMessages(textFixture());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, "Hola");
  assert.equal(rows[0].from, "5215512345678");
  assert.equal(rows[0].messageId, "wamid.ABC");
  assert.equal(rows[0].phoneNumberId, "PNID");
  assert.equal(String(rows[0].from).includes("@s.whatsapp.net"), false);

  const n = toNormalizedWhatsappCloudEvent({ integration, credentials, event: rows[0] });
  assert.equal(n.provider, "meta");
  assert.equal(n.channel, "whatsapp");
  assert.equal(n.integrationId, "int-1");
  assert.equal(n.ownerUserId, "owner-1");
  assert.equal(n.externalUserId, "5215512345678");
  assert.equal(n.text, "Hola");
  assert.equal(n.eventId, "wamid.ABC");
  assert.equal(n.messageId, "wamid.ABC");
  assert.equal(n.deviceId, "PNID");
  assert.equal(n.tenantId, null);
  assert.equal(n.isInboundMessage, true);
  assert.equal(n.unsupportedMediaOnly, false);
  assert.equal(n.displayPhone, "5215512345678");
  assert.equal(String(n.externalUserId).includes("@s.whatsapp.net"), false);
});

test("imagen/audio/documento sin texto marca unsupportedMediaOnly", () => {
  const make = (type) => ({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550001234", phone_number_id: "PNID" },
              messages: [
                {
                  from: "5215512345678",
                  id: `wamid.${type}`,
                  timestamp: "1700000000",
                  type,
                  [type]: { id: "media-1", mime_type: "application/octet-stream" },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  for (const type of ["image", "audio", "document"]) {
    const rows = expandWhatsappCloudInboundMessages(make(type));
    assert.equal(rows.length, 1, type);
    assert.equal(rows[0].unsupportedMediaOnly, true, type);
    assert.equal(rows[0].text, "", type);
  }
});

test("message.referral CTWA mapea adContext para formatCampaignCrmMessage", () => {
  const body = textFixture();
  body.entry[0].changes[0].value.messages[0].referral = {
    source_url: "https://fb.me/ad",
    source_id: "AD123",
    source_type: "ad",
    headline: "Suzuki Swift",
    body: "Conoce el Swift",
    ctwa_clid: "clid-9",
  };

  const rows = expandWhatsappCloudInboundMessages(body);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].adContext?.isAd, true);

  const n = toNormalizedWhatsappCloudEvent({ integration, credentials, event: rows[0] });
  assert.equal(n.adContext.isAd, true);
  assert.equal(n.adContext.sourceId, "AD123");
  assert.equal(n.adContext.sourceUrl, "https://fb.me/ad");
  assert.equal(n.adContext.title, "Suzuki Swift");
  assert.equal(n.adContext.body, "Conoce el Swift");
  assert.equal(n.adContext.ctwaClid, "clid-9");

  const crm = formatCampaignCrmMessage(n.text, n.adContext);
  assert.match(crm, /Título: Suzuki Swift/);
  assert.match(crm, /https:\/\/fb\.me\/ad/);
  assert.match(crm, /Conoce el Swift/);
});

test("statuses sin messages no produce inbound", () => {
  const rows = expandWhatsappCloudInboundMessages({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550001234", phone_number_id: "PNID" },
              statuses: [
                {
                  id: "wamid.ABC",
                  status: "delivered",
                  timestamp: "1700000000",
                  recipient_id: "5215512345678",
                },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.deepEqual(rows, []);
});
