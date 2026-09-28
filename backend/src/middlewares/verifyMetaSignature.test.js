import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  isValidMetaInstagramSignature,
  isValidMetaSignature,
  verifyMetaInstagramSignature,
  verifyMetaSignature,
} from "./verifyMetaSignature.js";

test("isValidMetaInstagramSignature acepta firma Meta válida", () => {
  const secret = "test_app_secret";
  const rawBody = '{"object":"instagram"}';
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const header = `sha256=${expected}`;
  assert.equal(isValidMetaInstagramSignature({ appSecret: secret, rawBody, signatureHeader: header }), true);
});

test("isValidMetaInstagramSignature rechaza firma incorrecta", () => {
  assert.equal(
    isValidMetaInstagramSignature({
      appSecret: "a",
      rawBody: "{}",
      signatureHeader: "sha256=deadbeef",
    }),
    false
  );
});

test("isValidMetaSignature es alias timing-safe de isValidMetaInstagramSignature", () => {
  assert.equal(isValidMetaSignature, isValidMetaInstagramSignature);
  const secret = "shared_secret";
  const rawBody = '{"object":"whatsapp_business_account"}';
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  assert.equal(
    isValidMetaSignature({ appSecret: secret, rawBody, signatureHeader: `sha256=${expected}` }),
    true
  );
  assert.equal(
    isValidMetaSignature({
      appSecret: secret,
      rawBody,
      signatureHeader: "sha256=0000000000000000000000000000000000000000000000000000000000000000",
    }),
    false
  );
});

test("verifyMetaSignature es alias de verifyMetaInstagramSignature", () => {
  assert.equal(verifyMetaSignature, verifyMetaInstagramSignature);
});
