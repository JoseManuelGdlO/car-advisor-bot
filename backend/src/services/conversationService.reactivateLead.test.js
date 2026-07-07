import test from "node:test";
import assert from "node:assert/strict";
import { resolveLeadUpsertOutcome } from "./conversationService.js";

test("resolveLeadUpsertOutcome creates when no existing lead", () => {
  const outcome = resolveLeadUpsertOutcome(null, {
    inboundChannel: "whatsapp",
    customerInfo: {},
    isInboundClientMessage: true,
    normalizedMessage: "Hola",
  });
  assert.equal(outcome.kind, "create");
});

test("resolveLeadUpsertOutcome reactivates eliminated lead", () => {
  const outcome = resolveLeadUpsertOutcome(
    { status: "eliminated", name: "Cliente", notes: "{}", interestedIn: "SUV" },
    {
      inboundChannel: "whatsapp",
      customerInfo: { nombre: "María" },
      isInboundClientMessage: true,
      normalizedMessage: "Quiero info",
    },
  );
  assert.equal(outcome.kind, "reactivate");
  assert.equal(outcome.patch.status, "lead");
  assert.equal(outcome.patch.channel, "whatsapp");
  assert.equal(outcome.patch.name, "María");
  assert.equal(outcome.patch.lastMessage, "Quiero info");
  assert.ok(outcome.patch.lastMessageAt instanceof Date);
});

test("resolveLeadUpsertOutcome keeps name when reactivating without customer nombre", () => {
  const outcome = resolveLeadUpsertOutcome(
    { status: "eliminated", name: "Cliente Previo" },
    {
      inboundChannel: "web",
      customerInfo: {},
      isInboundClientMessage: false,
      normalizedMessage: "ping",
    },
  );
  assert.equal(outcome.kind, "reactivate");
  assert.equal(outcome.patch.name, undefined);
  assert.equal(outcome.patch.lastMessage, undefined);
});

test("resolveLeadUpsertOutcome uses existing visible lead", () => {
  const outcome = resolveLeadUpsertOutcome(
    { status: "lead", name: "Ana" },
    {
      inboundChannel: "whatsapp",
      customerInfo: {},
      isInboundClientMessage: true,
      normalizedMessage: "Hola",
    },
  );
  assert.equal(outcome.kind, "use_existing");
});
