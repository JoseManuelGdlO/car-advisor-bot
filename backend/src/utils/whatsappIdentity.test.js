import test from "node:test";
import assert from "node:assert/strict";
import {
  extractDisplayPhoneFromChannelId,
  formatWhatsappGraphTo,
  isWhatsappChannelId,
  normalizeBlacklistPhone,
  normalizeDisplayPhone,
  resolveDisplayPhone,
} from "./whatsappIdentity.js";

test("isWhatsappChannelId detecta @lid y JIDs", () => {
  assert.equal(isWhatsappChannelId("60911863783463@lid"), true);
  assert.equal(isWhatsappChannelId("5215512345678@s.whatsapp.net"), true);
  assert.equal(isWhatsappChannelId("120363123456789012@g.us"), true);
  assert.equal(isWhatsappChannelId("6181556489"), false);
});

test("extractDisplayPhoneFromChannelId extrae de JID clásico", () => {
  assert.equal(extractDisplayPhoneFromChannelId("5215512345678@s.whatsapp.net"), "5215512345678");
  assert.equal(extractDisplayPhoneFromChannelId("60911863783463@lid"), null);
});

test("normalizeDisplayPhone rechaza IDs de canal", () => {
  assert.equal(normalizeDisplayPhone("60911863783463@lid"), null);
  assert.equal(normalizeDisplayPhone("6181556489"), "6181556489");
  assert.equal(normalizeDisplayPhone("+52 618 155 6489"), "+526181556489");
  assert.equal(normalizeDisplayPhone("123"), null);
});

test("normalizeBlacklistPhone agrega 521 a números de 10 dígitos", () => {
  assert.equal(normalizeBlacklistPhone("6181556489"), "5216181556489");
  assert.equal(normalizeBlacklistPhone("5216181556489"), "5216181556489");
});

test("normalizeBlacklistPhone rechaza más de 13 dígitos", () => {
  assert.equal(normalizeBlacklistPhone("52161815564891"), null);
});

test("normalizeBlacklistPhone convierte +52 de 12 dígitos a 521", () => {
  assert.equal(normalizeBlacklistPhone("+526181556489"), "5216181556489");
});

test("resolveDisplayPhone prioriza fromPhone", () => {
  assert.equal(
    resolveDisplayPhone({
      fromPhone: "6181556489",
      channelId: "60911863783463@lid",
      customerTelefono: "5511111111",
    }),
    "6181556489",
  );
});

test("resolveDisplayPhone usa customerTelefono si no hay fromPhone", () => {
  assert.equal(
    resolveDisplayPhone({
      channelId: "60911863783463@lid",
      customerTelefono: "5511111111",
    }),
    "5511111111",
  );
});

test("resolveDisplayPhone extrae de JID clásico como último recurso", () => {
  assert.equal(
    resolveDisplayPhone({
      channelId: "5215512345678@s.whatsapp.net",
    }),
    "5215512345678",
  );
});

test("formatWhatsappGraphTo quita + y @s.whatsapp.net y usa prefijo 521", () => {
  assert.equal(formatWhatsappGraphTo("6183218624"), "5216183218624");
  assert.equal(formatWhatsappGraphTo("5216183218624"), "5216183218624");
  assert.equal(formatWhatsappGraphTo("+52 1 618 321 8624"), "5216183218624");
  assert.equal(formatWhatsappGraphTo("6183218624@s.whatsapp.net"), "5216183218624");
  assert.equal(formatWhatsappGraphTo("5215512345678@s.whatsapp.net"), "5215512345678");
  assert.equal(formatWhatsappGraphTo(""), "");
  assert.equal(formatWhatsappGraphTo("55"), "");
});

test("formatWhatsappGraphTo conserva dígitos internacionales 10-15 sin forzar MX 521", () => {
  assert.equal(formatWhatsappGraphTo("16505551234"), "16505551234");
  assert.equal(formatWhatsappGraphTo("+1 650 555 1234"), "16505551234");
  assert.equal(formatWhatsappGraphTo("5215512345678@s.whatsapp.net"), "5215512345678");
});
