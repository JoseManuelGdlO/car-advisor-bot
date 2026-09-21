import test from "node:test";
import assert from "node:assert/strict";
import { parseGraphErrorPayload, userFacingMetaCodeMessage } from "../utils/metaError.js";

test("parseGraphErrorPayload extrae code, subcode y fbtraceId", () => {
  const parsed = parseGraphErrorPayload(
    { error: { message: "Invalid parameter", code: 100, error_subcode: 33, fbtrace_id: "abc" } },
    400
  );
  assert.equal(parsed.httpStatus, 400);
  assert.equal(parsed.code, 100);
  assert.equal(parsed.subcode, 33);
  assert.equal(parsed.fbtraceId, "abc");
});

test("userFacingMetaCodeMessage conserva fallback si el code no está mapeado", () => {
  assert.equal(userFacingMetaCodeMessage(999999, "hola"), "hola");
});
