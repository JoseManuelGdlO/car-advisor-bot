import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInboundChannel } from "./integrationChannel.js";

test("normalizeInboundChannel maps known values", () => {
  assert.equal(normalizeInboundChannel("WhatsApp"), "whatsapp");
  assert.equal(normalizeInboundChannel("api"), "api");
});

test("normalizeInboundChannel defaults unknown to api", () => {
  assert.equal(normalizeInboundChannel("unknown-channel"), "api");
});
