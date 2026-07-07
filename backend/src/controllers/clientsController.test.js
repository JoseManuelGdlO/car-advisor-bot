import test from "node:test";
import assert from "node:assert/strict";
import {
  patchClientSchema,
  resolveCreateClientOutcome,
} from "./clientsController.js";

test("patchClientSchema rechaza status eliminated", () => {
  assert.throws(() =>
    patchClientSchema.parse({
      name: "Ana",
      displayPhone: "5512345678",
      status: "eliminated",
      interestedIn: "",
    }),
  );
});

test("patchClientSchema acepta campos comerciales", () => {
  const payload = patchClientSchema.parse({
    name: "Ana",
    displayPhone: "5512345678",
    status: "negotiation",
    interestedIn: "SUV 2024",
  });
  assert.equal(payload.status, "negotiation");
  assert.equal(payload.displayPhone, "5512345678");
  assert.equal(payload.interestedIn, "SUV 2024");
});

test("resolveCreateClientOutcome creates when no existing row", () => {
  const outcome = resolveCreateClientOutcome(null, { name: "Luis", phone: "5511111111" });
  assert.equal(outcome.kind, "create");
});

test("resolveCreateClientOutcome reactivates eliminated client", () => {
  const existing = {
    status: "eliminated",
    channel: "whatsapp",
    interestedIn: "Auto viejo",
    notes: '{"customer_info":{}}',
    avatarColor: "hsl(142 70% 49%)",
  };
  const outcome = resolveCreateClientOutcome(existing, {
    name: "Luis Nuevo",
    phone: "5511111111",
    channel: "instagram",
    interestedIn: "Sedán",
  });
  assert.equal(outcome.kind, "reactivate");
  assert.equal(outcome.patch.status, "lead");
  assert.equal(outcome.patch.name, "Luis Nuevo");
  assert.equal(outcome.patch.channel, "instagram");
  assert.equal(outcome.patch.interestedIn, "Sedán");
  assert.equal(outcome.patch.displayPhone, "5511111111");
});

test("resolveCreateClientOutcome conflicts when client is visible", () => {
  const outcome = resolveCreateClientOutcome(
    { status: "lead", channel: "web", interestedIn: "", notes: null, avatarColor: null },
    { name: "Luis", phone: "5511111111" },
  );
  assert.equal(outcome.kind, "conflict");
});
