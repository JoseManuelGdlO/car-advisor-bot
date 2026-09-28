import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGraphErrorPayload,
  summarizeMetaError,
  summarizeMetaErrors,
  toMetaErrorMeta,
  userFacingMetaCodeMessage,
} from "./metaError.js";

test("summarizeMetaError lee Graph error.code error_data.details y fbtrace_id", () => {
  assert.deepEqual(
    summarizeMetaError({
      error: {
        message: "(#131026) Message undeliverable",
        type: "OAuthException",
        code: 131026,
        error_subcode: 33,
        error_data: { details: "Message Undeliverable." },
        fbtrace_id: "ABC123",
      },
    }),
    {
      code: 131026,
      subcode: 33,
      type: "OAuthException",
      title: null,
      message: "(#131026) Message undeliverable",
      details: "Message Undeliverable.",
      fbtraceId: "ABC123",
      href: null,
    }
  );
});

test("summarizeMetaError lee error de webhook status.errors", () => {
  assert.deepEqual(
    summarizeMetaError({
      code: 131026,
      title: "Message undeliverable",
      message: "Message undeliverable",
      error_data: { details: "Generic user error" },
      href: "https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/",
    }),
    {
      code: 131026,
      subcode: null,
      type: null,
      title: "Message undeliverable",
      message: "Message undeliverable",
      details: "Generic user error",
      fbtraceId: null,
      href: "https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/",
    }
  );
});

test("summarizeMetaError no pierde details si ya venía resumido", () => {
  const once = summarizeMetaError({
    code: 131026,
    message: "Message undeliverable",
    error_data: { details: "Message Undeliverable." },
  });
  assert.equal(summarizeMetaError(once).details, "Message Undeliverable.");
});

test("summarizeMetaErrors ignora entradas vacías", () => {
  const rows = summarizeMetaErrors([{}, { code: 100, message: "bad" }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, 100);
  assert.equal(rows[0].message, "bad");
});

test("parseGraphErrorPayload extrae code, subcode, details y fbtraceId", () => {
  const parsed = parseGraphErrorPayload(
    {
      error: {
        message: "Invalid parameter",
        type: "GraphMethodException",
        code: 100,
        error_subcode: 33,
        error_user_title: "Unsupported post request",
        error_data: { details: "Object with ID does not exist" },
        fbtrace_id: "abc",
        href: "https://developers.facebook.com/docs/graph-api/using-graph-api/error-handling/",
      },
    },
    400
  );
  assert.equal(parsed.httpStatus, 400);
  assert.equal(parsed.code, 100);
  assert.equal(parsed.subcode, 33);
  assert.equal(parsed.type, "GraphMethodException");
  assert.equal(parsed.title, "Unsupported post request");
  assert.equal(parsed.message, "Invalid parameter");
  assert.equal(parsed.details, "Object with ID does not exist");
  assert.equal(parsed.fbtraceId, "abc");
  assert.match(parsed.href, /error-handling/);
});

test("parseGraphErrorPayload usa error string si Graph no devolvió objeto", () => {
  const parsed = parseGraphErrorPayload({ error: "upstream timeout" }, 502);
  assert.equal(parsed.httpStatus, 502);
  assert.equal(parsed.message, "upstream timeout");
});

test("toMetaErrorMeta conserva httpStatus y fallback de message", () => {
  const meta = toMetaErrorMeta({ code: 10 }, { httpStatus: 403, message: "sin permiso" });
  assert.equal(meta.httpStatus, 403);
  assert.equal(meta.code, 10);
  assert.equal(meta.message, "sin permiso");
  assert.equal(meta.details, null);
});

test("userFacingMetaCodeMessage conserva fallback si el code no está mapeado", () => {
  assert.equal(userFacingMetaCodeMessage(999999, "hola"), "hola");
});

test("userFacingMetaCodeMessage traduce 131047 y 100", () => {
  assert.match(userFacingMetaCodeMessage(131047, "Re-engagement message"), /24 horas/i);
  assert.match(userFacingMetaCodeMessage(100, "Invalid parameter"), /configuración de la app/i);
});
