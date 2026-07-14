import test from "node:test";
import assert from "node:assert/strict";
import { resolveKindFilter, toOwnerNotificationDto } from "./ownerNotifications.js";

test("resolveKindFilter mapea aliases de grupo", () => {
  assert.deepEqual(resolveKindFilter("lead"), ["lead_interest"]);
  assert.deepEqual(resolveKindFilter("advisor"), ["human_advisor"]);
  assert.deepEqual(resolveKindFilter("escalation"), ["human_advisor", "financing_detail_help"]);
  assert.deepEqual(resolveKindFilter("inbound"), ["new_inbound_message"]);
});

test("resolveKindFilter acepta kind exacto", () => {
  assert.deepEqual(resolveKindFilter("lead_interest"), ["lead_interest"]);
  assert.deepEqual(resolveKindFilter("financing_detail_help"), ["financing_detail_help"]);
});

test("resolveKindFilter vacío o desconocido", () => {
  assert.equal(resolveKindFilter(""), null);
  assert.equal(resolveKindFilter(null), null);
  assert.deepEqual(resolveKindFilter("custom_future"), ["custom_future"]);
});

test("toOwnerNotificationDto serializa readAt nulo", () => {
  const dto = toOwnerNotificationDto({
    id: "11111111-1111-1111-1111-111111111111",
    title: "Lead",
    body: "Cliente interesado",
    kind: "lead_interest",
    conversationId: null,
    createdAt: new Date("2026-07-14T12:00:00.000Z"),
    readAt: null,
  });
  assert.equal(dto.readAt, null);
  assert.equal(dto.kind, "lead_interest");
  assert.equal(dto.createdAt, "2026-07-14T12:00:00.000Z");
});
