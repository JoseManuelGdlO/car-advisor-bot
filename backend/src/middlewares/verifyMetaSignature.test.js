import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { isValidMetaInstagramSignature } from "./verifyMetaSignature.js";

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
