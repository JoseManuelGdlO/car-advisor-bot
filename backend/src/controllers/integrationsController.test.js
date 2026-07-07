import test from "node:test";
import assert from "node:assert/strict";
import { resolveCreateIntegrationOutcome } from "./integrationsController.js";

test("resolveCreateIntegrationOutcome creates when no existing row", () => {
  const outcome = resolveCreateIntegrationOutcome(null, { channel: "whatsapp", provider: "meta" });
  assert.equal(outcome.kind, "create");
});

test("resolveCreateIntegrationOutcome reactivates eliminated integration", () => {
  const existing = {
    status: "eliminated",
    displayName: "Old name",
    webhookUrl: "https://example.com/hook",
  };
  const outcome = resolveCreateIntegrationOutcome(existing, {
    channel: "whatsapp",
    provider: "meta",
    displayName: "New name",
  });
  assert.equal(outcome.kind, "reactivate");
  assert.equal(outcome.patch.status, "draft");
  assert.equal(outcome.patch.displayName, "New name");
  assert.equal(outcome.patch.lastError, null);
});

test("resolveCreateIntegrationOutcome conflicts when integration is visible", () => {
  const outcome = resolveCreateIntegrationOutcome(
    { status: "active", displayName: null, webhookUrl: null },
    { channel: "whatsapp", provider: "meta" }
  );
  assert.equal(outcome.kind, "conflict");
});
