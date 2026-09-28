import test from "node:test";
import assert from "node:assert/strict";
import { ChannelCredential, ChannelIntegration } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { encryptCredentialsPayload } from "../utils/credentialsCrypto.js";
import {
  assertPhoneNumberIdExclusiveToOwner,
  META_WHATSAPP_PROVIDER,
  normalizeMetaCredentials,
  resolveInstagramMetaIntegrationById,
  resolveMetaWhatsappByPhoneNumberId,
  resolveMetaWhatsappIntegrationById,
  resolveWhatsappConnectIntegrationById,
  WHATSAPP_CHANNEL,
} from "./integrationResolverService.js";

test("normalizeMetaCredentials extrae token y phoneNumberId", () => {
  const creds = normalizeMetaCredentials({
    accessToken: " tok ",
    wabaId: "waba",
    phoneNumberId: "123",
    displayPhoneNumber: "+52 1",
    coexistenceEnabled: 1,
  });
  assert.equal(creds.accessToken, "tok");
  assert.equal(creds.phoneNumberId, "123");
  assert.equal(creds.coexistenceEnabled, true);
});

test("META_WHATSAPP_PROVIDER es meta y el canal es whatsapp", () => {
  assert.equal(META_WHATSAPP_PROVIDER, "meta");
  assert.equal(WHATSAPP_CHANNEL, "whatsapp");
});

test("assertPhoneNumberIdExclusiveToOwner lanza 409 si otra cuenta tiene el número", async () => {
  const original = ChannelIntegration.findAll;
  ChannelIntegration.findAll = async () => [{ ownerUserId: "other-user", phoneNumberId: "123" }];
  try {
    await assert.rejects(
      () => assertPhoneNumberIdExclusiveToOwner({ phoneNumberId: "123", ownerUserId: "me" }),
      (err) =>
        err instanceof ApiError &&
        err.status === 409 &&
        err.message === "Este número de WhatsApp ya está vinculado a otra cuenta."
    );
  } finally {
    ChannelIntegration.findAll = original;
  }
});

test("assertPhoneNumberIdExclusiveToOwner permite reutilizar el número del mismo dueño", async () => {
  const original = ChannelIntegration.findAll;
  ChannelIntegration.findAll = async () => [{ ownerUserId: "me", phoneNumberId: "123" }];
  try {
    await assertPhoneNumberIdExclusiveToOwner({ phoneNumberId: "123", ownerUserId: "me" });
  } finally {
    ChannelIntegration.findAll = original;
  }
});

test("assertPhoneNumberIdExclusiveToOwner lanza 409 si el número está solo en credenciales de otra cuenta", async () => {
  const originalFindAll = ChannelIntegration.findAll;
  const originalCredFindOne = ChannelCredential.findOne;
  ChannelIntegration.findAll = async ({ where } = {}) => {
    if (where?.phoneNumberId) return [];
    return [{ id: "int-other", ownerUserId: "other-user", phoneNumberId: null }];
  };
  ChannelCredential.findOne = async () => ({
    cipherText: encryptCredentialsPayload({ accessToken: "tok", phoneNumberId: "pn-hidden" }),
  });
  try {
    await assert.rejects(
      () => assertPhoneNumberIdExclusiveToOwner({ phoneNumberId: "pn-hidden", ownerUserId: "me" }),
      (err) =>
        err instanceof ApiError &&
        err.status === 409 &&
        err.message === "Este número de WhatsApp ya está vinculado a otra cuenta."
    );
  } finally {
    ChannelIntegration.findAll = originalFindAll;
    ChannelCredential.findOne = originalCredFindOne;
  }
});

test("assertPhoneNumberIdExclusiveToOwner permite el mismo dueño si el id está solo en credenciales", async () => {
  const originalFindAll = ChannelIntegration.findAll;
  const originalCredFindOne = ChannelCredential.findOne;
  ChannelIntegration.findAll = async () => [
    { id: "int-me", ownerUserId: "me", phoneNumberId: null },
  ];
  ChannelCredential.findOne = async () => ({
    cipherText: encryptCredentialsPayload({ accessToken: "tok", phoneNumberId: "pn-mine" }),
  });
  try {
    await assertPhoneNumberIdExclusiveToOwner({ phoneNumberId: "pn-mine", ownerUserId: "me" });
  } finally {
    ChannelIntegration.findAll = originalFindAll;
    ChannelCredential.findOne = originalCredFindOne;
  }
});

test("resolveMetaWhatsappByPhoneNumberId prefiere la columna phoneNumberId", async () => {
  const originalFindOne = ChannelIntegration.findOne;
  const originalCredFindOne = ChannelCredential.findOne;
  const row = {
    id: "int-1",
    ownerUserId: "owner-1",
    wabaId: "waba-col",
    phoneNumberId: "pn-col",
    displayPhoneNumber: "+52 1",
    coexistenceEnabled: true,
  };
  ChannelIntegration.findOne = async () => row;
  ChannelCredential.findOne = async () => ({
    cipherText: encryptCredentialsPayload({ accessToken: "tok", phoneNumberId: "pn-cred" }),
  });
  try {
    const resolved = await resolveMetaWhatsappByPhoneNumberId({ phoneNumberId: "pn-col" });
    assert.equal(resolved.integration.id, "int-1");
    assert.equal(resolved.credentials.phoneNumberId, "pn-col");
    assert.equal(resolved.credentials.accessToken, "tok");
    assert.equal(resolved.provider, "meta");
  } finally {
    ChannelIntegration.findOne = originalFindOne;
    ChannelCredential.findOne = originalCredFindOne;
  }
});

test("resolveWhatsappConnectIntegrationById y resolveInstagramMetaIntegrationById siguen exportados", () => {
  assert.equal(typeof resolveWhatsappConnectIntegrationById, "function");
  assert.equal(typeof resolveInstagramMetaIntegrationById, "function");
  assert.equal(typeof resolveMetaWhatsappIntegrationById, "function");
});

test("resolveMetaWhatsappByPhoneNumberId no usa fila activa sin accessToken", async () => {
  const originalFindOne = ChannelIntegration.findOne;
  const originalFindAll = ChannelIntegration.findAll;
  const originalCredFindOne = ChannelCredential.findOne;
  const row = {
    id: "int-empty-token",
    ownerUserId: "owner-empty",
    wabaId: "waba-empty",
    phoneNumberId: "pn-empty",
    displayPhoneNumber: "+52 0",
    coexistenceEnabled: false,
  };
  ChannelIntegration.findOne = async () => row;
  ChannelIntegration.findAll = async () => [];
  ChannelCredential.findOne = async () => ({
    cipherText: encryptCredentialsPayload({ phoneNumberId: "pn-empty" }),
  });
  try {
    await assert.rejects(
      () => resolveMetaWhatsappByPhoneNumberId({ phoneNumberId: "pn-empty" }),
      (err) =>
        err instanceof ApiError &&
        err.status === 404 &&
        err.message === "No active meta whatsapp integration for this phone_number_id"
    );
  } finally {
    ChannelIntegration.findOne = originalFindOne;
    ChannelIntegration.findAll = originalFindAll;
    ChannelCredential.findOne = originalCredFindOne;
  }
});

test("resolveMetaWhatsappByPhoneNumberId no lanza 400 si fallan credenciales de la columna", async () => {
  const originalFindOne = ChannelIntegration.findOne;
  const originalFindAll = ChannelIntegration.findAll;
  const originalCredFindOne = ChannelCredential.findOne;
  const columnRow = {
    id: "int-col-broken",
    ownerUserId: "owner-broken",
    wabaId: "waba-broken",
    phoneNumberId: "pn-target",
    displayPhoneNumber: "+52 9",
    coexistenceEnabled: false,
  };
  const fallbackRow = {
    id: "int-fallback-ok",
    ownerUserId: "owner-ok",
    wabaId: "waba-ok",
    phoneNumberId: null,
    displayPhoneNumber: "+52 8",
    coexistenceEnabled: false,
  };
  ChannelIntegration.findOne = async () => columnRow;
  ChannelIntegration.findAll = async () => [columnRow, fallbackRow];
  ChannelCredential.findOne = async (opts) => {
    if (opts?.where?.channelIntegrationId === "int-col-broken") return null;
    return {
      cipherText: encryptCredentialsPayload({ accessToken: "tok-ok", phoneNumberId: "pn-target" }),
    };
  };
  try {
    const resolved = await resolveMetaWhatsappByPhoneNumberId({ phoneNumberId: "pn-target" });
    assert.equal(resolved.integration.id, "int-fallback-ok");
    assert.equal(resolved.credentials.accessToken, "tok-ok");
    assert.equal(resolved.provider, "meta");
  } finally {
    ChannelIntegration.findOne = originalFindOne;
    ChannelIntegration.findAll = originalFindAll;
    ChannelCredential.findOne = originalCredFindOne;
  }
});

test("resolveMetaWhatsappByPhoneNumberId cae a credenciales si la columna no coincide", async () => {
  const originalFindOne = ChannelIntegration.findOne;
  const originalFindAll = ChannelIntegration.findAll;
  const originalCredFindOne = ChannelCredential.findOne;
  const row = {
    id: "int-2",
    ownerUserId: "owner-2",
    wabaId: "waba-2",
    phoneNumberId: null,
    displayPhoneNumber: "+52 2",
    coexistenceEnabled: false,
  };
  ChannelIntegration.findOne = async () => null;
  ChannelIntegration.findAll = async () => [row];
  ChannelCredential.findOne = async () => ({
    cipherText: encryptCredentialsPayload({ accessToken: "tok-2", phoneNumberId: "pn-fallback" }),
  });
  try {
    const resolved = await resolveMetaWhatsappByPhoneNumberId({ phoneNumberId: "pn-fallback" });
    assert.equal(resolved.integration.id, "int-2");
    assert.equal(resolved.credentials.phoneNumberId, "pn-fallback");
    assert.equal(resolved.provider, "meta");
  } finally {
    ChannelIntegration.findOne = originalFindOne;
    ChannelIntegration.findAll = originalFindAll;
    ChannelCredential.findOne = originalCredFindOne;
  }
});
