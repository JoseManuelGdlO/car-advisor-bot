import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWcInboundEvent } from "./wcEventNormalizer.js";

test("normalizeWcInboundEvent normaliza mensaje inbound", () => {
  // Verifica mapeo completo de campos esperados en evento inbound.
  const normalized = normalizeWcInboundEvent({
    payload: {
      event: "message.inbound",
      eventId: "evt-1",
      timestamp: "2026-04-27T10:00:00.000Z",
      from: "5215511111111",
      message: { id: "msg-1", text: "hola" },
      deviceId: "dev-1",
    },
    integration: { id: "int-1", ownerUserId: "owner-1" },
    credentials: { tenantId: "tenant-1", deviceId: "dev-1" },
  });

  assert.equal(normalized.provider, "whatsapp-connect");
  assert.equal(normalized.channel, "whatsapp");
  assert.equal(normalized.integrationId, "int-1");
  assert.equal(normalized.ownerUserId, "owner-1");
  assert.equal(normalized.externalUserId, "5215511111111");
  assert.equal(normalized.messageId, "msg-1");
  assert.equal(normalized.text, "hola");
  assert.equal(normalized.isInboundMessage, true);
  assert.equal(normalized.unsupportedMediaOnly, false);
});

test("normalizeWcInboundEvent detecta eventos no inbound", () => {
  // Eventos de estado no deben entrar al pipeline de respuesta automática.
  const normalized = normalizeWcInboundEvent({
    payload: {
      event: "device.status",
      eventId: "evt-2",
      from: "5215511111111",
      deviceId: "dev-2",
    },
    integration: { id: "int-2", ownerUserId: "owner-2" },
    credentials: { deviceId: "dev-2" },
  });
  assert.equal(normalized.isInboundMessage, false);
});

test("normalizeWcInboundEvent soporta payload de webhookDispatch (normalized/raw)", () => {
  // Compatibilidad con el shape emitido por whatsapp-connect-v2.
  const normalized = normalizeWcInboundEvent({
    payload: {
      eventId: "evt-3",
      type: "message.inbound",
      deviceId: "dev-3",
      createdAt: "2026-04-27T12:00:00.000Z",
      normalized: {
        messageId: "msg-3",
        from: "5215512345678@s.whatsapp.net",
        content: { type: "text", text: "hola desde normalized" },
      },
      raw: {
        key: { remoteJid: "5215512345678@s.whatsapp.net" },
      },
    },
    integration: { id: "int-3", ownerUserId: "owner-3" },
    credentials: { deviceId: "dev-3" },
  });

  assert.equal(normalized.externalUserId, "5215512345678@s.whatsapp.net");
  assert.equal(normalized.messageId, "msg-3");
  assert.equal(normalized.text, "hola desde normalized");
  assert.equal(normalized.isInboundMessage, true);
  assert.equal(normalized.unsupportedMediaOnly, false);
});

test("normalizeWcInboundEvent extrae displayPhone de fromPhone con @lid", () => {
  const normalized = normalizeWcInboundEvent({
    payload: {
      event: "message.inbound",
      eventId: "evt-lid",
      from: "60911863783463@lid",
      normalized: { fromPhone: "6181556489", messageId: "msg-lid", content: { text: "hola" } },
      deviceId: "dev-1",
    },
    integration: { id: "int-1", ownerUserId: "owner-1" },
    credentials: { deviceId: "dev-1" },
  });

  assert.equal(normalized.externalUserId, "60911863783463@lid");
  assert.equal(normalized.displayPhone, "6181556489");
});

test("normalizeWcInboundEvent extrae displayPhone de JID clásico sin fromPhone", () => {
  const normalized = normalizeWcInboundEvent({
    payload: {
      eventId: "evt-jid",
      type: "message.inbound",
      deviceId: "dev-3",
      normalized: {
        messageId: "msg-3",
        from: "5215512345678@s.whatsapp.net",
        content: { type: "text", text: "hola" },
      },
    },
    integration: { id: "int-3", ownerUserId: "owner-3" },
    credentials: { deviceId: "dev-3" },
  });

  assert.equal(normalized.externalUserId, "5215512345678@s.whatsapp.net");
  assert.equal(normalized.displayPhone, "5215512345678");
});

test("normalizeWcInboundEvent deja displayPhone null para @lid sin fromPhone", () => {
  const normalized = normalizeWcInboundEvent({
    payload: {
      event: "message.inbound",
      eventId: "evt-lid-empty",
      from: "60911863783463@lid",
      message: { id: "msg-x", text: "hola" },
      deviceId: "dev-1",
    },
    integration: { id: "int-1", ownerUserId: "owner-1" },
    credentials: { deviceId: "dev-1" },
  });

  assert.equal(normalized.externalUserId, "60911863783463@lid");
  assert.equal(normalized.displayPhone, null);
});

test("normalizeWcInboundEvent marca unsupportedMediaOnly cuando hay media sin texto", () => {
  const normalized = normalizeWcInboundEvent({
    payload: {
      event: "message.inbound",
      eventId: "evt-media",
      from: "5215511111111",
      message: { id: "msg-img", media: [{ type: "image", url: "https://x/y.jpg" }] },
      deviceId: "dev-1",
    },
    integration: { id: "int-1", ownerUserId: "owner-1" },
    credentials: { tenantId: "tenant-1", deviceId: "dev-1" },
  });
  assert.equal(normalized.text, "");
  assert.equal(normalized.unsupportedMediaOnly, true);
  assert.ok(Array.isArray(normalized.media));
});

test("normalizeWcInboundEvent propaga adContext normalizado de WC", () => {
  const normalized = normalizeWcInboundEvent({
    payload: {
      eventId: "evt-ad",
      type: "message.inbound",
      deviceId: "dev-ad",
      normalized: {
        messageId: "msg-ad",
        from: "5215512345678@s.whatsapp.net",
        content: { type: "text", text: "Hola! Quiero más información" },
        adContext: {
          isAd: true,
          title: "Nissan Versa 2020",
          body: "Estas vacaciones merecen un Versa",
          sourceId: "ad-1",
          sourceUrl: "https://fb.me/x",
          sourceApp: "facebook",
          ctwaClid: "clid-1",
          mediaUrl: null,
          greetingMessageBody: "Hola! Quiero más información",
        },
      },
    },
    integration: { id: "int-ad", ownerUserId: "owner-ad" },
    credentials: { deviceId: "dev-ad" },
  });

  assert.equal(normalized.adContext?.isAd, true);
  assert.equal(normalized.adContext?.title, "Nissan Versa 2020");
  assert.equal(normalized.adContext?.ctwaClid, "clid-1");
});

test("normalizeWcInboundEvent extrae adContext desde raw Baileys si falta en normalized", () => {
  const normalized = normalizeWcInboundEvent({
    payload: {
      eventId: "evt-ad-raw",
      type: "message.inbound",
      deviceId: "dev-ad",
      normalized: {
        messageId: "msg-ad-raw",
        from: "5215512345678@s.whatsapp.net",
        content: { type: "text", text: "Hola! Quiero más información" },
      },
      raw: {
        key: { remoteJid: "5215512345678@s.whatsapp.net" },
        message: {
          extendedTextMessage: {
            text: "Hola! Quiero más información",
            contextInfo: {
              externalAdReply: {
                title: "Toyota Corolla 2019",
                body: "Corolla en excelentes condiciones",
                sourceType: "ad",
                ctwaClid: "clid-raw",
                showAdAttribution: true,
              },
            },
          },
        },
      },
    },
    integration: { id: "int-ad", ownerUserId: "owner-ad" },
    credentials: { deviceId: "dev-ad" },
  });

  assert.equal(normalized.adContext?.isAd, true);
  assert.equal(normalized.adContext?.title, "Toyota Corolla 2019");
  assert.equal(normalized.adContext?.ctwaClid, "clid-raw");
});

test("normalizeWcInboundEvent deja adContext null en mensajes sin anuncio", () => {
  const normalized = normalizeWcInboundEvent({
    payload: {
      eventId: "evt-3",
      type: "message.inbound",
      deviceId: "dev-3",
      createdAt: "2026-04-27T12:00:00.000Z",
      normalized: {
        messageId: "msg-3",
        from: "5215512345678@s.whatsapp.net",
        content: { type: "text", text: "hola desde normalized" },
      },
    },
    integration: { id: "int-3", ownerUserId: "owner-3" },
    credentials: { deviceId: "dev-3" },
  });
  assert.equal(normalized.adContext, null);
});

test("normalizeWcInboundEvent no marca adContext en preview de link (solo title/body/url)", () => {
  const normalized = normalizeWcInboundEvent({
    payload: {
      eventId: "evt-link-preview",
      type: "message.inbound",
      deviceId: "dev-ad",
      normalized: {
        messageId: "msg-link-preview",
        from: "5215512345678@s.whatsapp.net",
        content: { type: "text", text: "mira este auto https://example.com/versa" },
      },
      raw: {
        key: { remoteJid: "5215512345678@s.whatsapp.net" },
        message: {
          extendedTextMessage: {
            text: "mira este auto https://example.com/versa",
            contextInfo: {
              externalAdReply: {
                title: "Nissan Versa 2020",
                body: "Ficha del Versa en stock",
                sourceUrl: "https://example.com/versa",
                mediaUrl: "https://cdn.example/preview.jpg",
              },
            },
          },
        },
      },
    },
    integration: { id: "int-ad", ownerUserId: "owner-ad" },
    credentials: { deviceId: "dev-ad" },
  });
  assert.equal(normalized.adContext, null);
});

test("normalizeWcInboundEvent detecta CTWA por entryPointConversionSource sin externalAdReply", () => {
  const normalized = normalizeWcInboundEvent({
    payload: {
      eventId: "evt-ctwa-entry",
      type: "message.inbound",
      deviceId: "dev-ad",
      normalized: {
        messageId: "msg-ctwa-entry",
        from: "5215512345678@s.whatsapp.net",
        content: { type: "text", text: "Hola! Quiero más información" },
      },
      raw: {
        key: { remoteJid: "5215512345678@s.whatsapp.net" },
        message: {
          extendedTextMessage: {
            text: "Hola! Quiero más información",
            contextInfo: {
              entryPointConversionSource: "ctwa_ad",
              conversionSource: "FB_Ads",
              entryPointConversionApp: "instagram",
            },
          },
        },
      },
    },
    integration: { id: "int-ad", ownerUserId: "owner-ad" },
    credentials: { deviceId: "dev-ad" },
  });
  assert.equal(normalized.adContext?.isAd, true);
  assert.equal(normalized.adContext?.sourceApp, "instagram");
});
