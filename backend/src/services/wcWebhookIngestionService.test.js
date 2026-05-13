import test from "node:test";
import assert from "node:assert/strict";
import {
  UNSUPPORTED_INBOUND_CRM_CLIENT_MESSAGE,
  UNSUPPORTED_INBOUND_OUTBOUND_REPLY,
} from "./wcWebhookIngestionService.js";

test("textos fijos de solo-media mencionan texto y el mensaje CRM no está vacío", () => {
  assert.match(UNSUPPORTED_INBOUND_OUTBOUND_REPLY, /texto/i);
  assert.ok(UNSUPPORTED_INBOUND_CRM_CLIENT_MESSAGE.length > 0);
});
