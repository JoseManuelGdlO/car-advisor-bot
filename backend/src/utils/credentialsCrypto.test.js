import test from "node:test";
import assert from "node:assert/strict";
import { decryptCredentialsPayload, encryptCredentialsPayload } from "./credentialsCrypto.js";

test("encryptCredentialsPayload roundtrip", () => {
  const obj = { accessToken: "secret", phoneNumberId: "123" };
  const enc = encryptCredentialsPayload(obj);
  const dec = decryptCredentialsPayload(enc);
  assert.deepEqual(dec, obj);
});
