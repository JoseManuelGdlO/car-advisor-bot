import test from "node:test";
import assert from "node:assert/strict";
import { buildLeadDisplayPhoneUpdate } from "./conversationService.js";

test("buildLeadDisplayPhoneUpdate usa fromPhone con channel @lid", () => {
  const update = buildLeadDisplayPhoneUpdate({
    displayPhone: "6181556489",
    channelUserId: "60911863783463@lid",
    customerTelefono: "",
    existingDisplayPhone: null,
  });
  assert.equal(update.displayPhone, "6181556489");
});

test("buildLeadDisplayPhoneUpdate no devuelve nada si no hay teléfono válido", () => {
  const update = buildLeadDisplayPhoneUpdate({
    displayPhone: null,
    channelUserId: "60911863783463@lid",
    customerTelefono: "",
    existingDisplayPhone: null,
  });
  assert.deepEqual(update, {});
});

test("buildLeadDisplayPhoneUpdate usa customerTelefono si no hay fromPhone", () => {
  const update = buildLeadDisplayPhoneUpdate({
    displayPhone: null,
    channelUserId: "60911863783463@lid",
    customerTelefono: "5512345678",
    existingDisplayPhone: null,
  });
  assert.equal(update.displayPhone, "5512345678");
});

test("buildLeadDisplayPhoneUpdate extrae de JID clásico para lead web/manual", () => {
  const update = buildLeadDisplayPhoneUpdate({
    displayPhone: null,
    channelUserId: "5215512345678@s.whatsapp.net",
    customerTelefono: "",
    existingDisplayPhone: null,
  });
  assert.equal(update.displayPhone, "5215512345678");
});
