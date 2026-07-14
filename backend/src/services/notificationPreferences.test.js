import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  shouldDeliverPush,
  toNotificationPreferencesDto,
} from "./notificationPreferences.js";

test("toNotificationPreferencesDto aplica defaults seguros", () => {
  assert.deepEqual(toNotificationPreferencesDto(null), DEFAULT_NOTIFICATION_PREFERENCES);
  assert.deepEqual(toNotificationPreferencesDto({}), {
    pushEnabled: true,
    notifyLeadInterest: true,
    notifyEscalations: true,
    notifyInboundMessages: true,
  });
  assert.deepEqual(
    toNotificationPreferencesDto({
      pushEnabled: false,
      notifyLeadInterest: false,
      notifyEscalations: false,
      notifyInboundMessages: true,
    }),
    {
      pushEnabled: false,
      notifyLeadInterest: false,
      notifyEscalations: false,
      notifyInboundMessages: true,
    },
  );
});

test("shouldDeliverPush bloquea cuando master esta off", () => {
  const result = shouldDeliverPush({
    prefs: { ...DEFAULT_NOTIFICATION_PREFERENCES, pushEnabled: false },
    kind: "lead_interest",
  });
  assert.equal(result.deliver, false);
  assert.equal(result.skippedReason, "push_disabled");
});

test("shouldDeliverPush respeta lead_interest off", () => {
  const result = shouldDeliverPush({
    prefs: { ...DEFAULT_NOTIFICATION_PREFERENCES, notifyLeadInterest: false },
    kind: "lead_interest",
  });
  assert.equal(result.deliver, false);
  assert.equal(result.skippedReason, "kind_disabled");
});

test("shouldDeliverPush agrupa escalaciones", () => {
  const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, notifyEscalations: false };
  assert.equal(shouldDeliverPush({ prefs, kind: "human_advisor" }).deliver, false);
  assert.equal(shouldDeliverPush({ prefs, kind: "financing_detail_help" }).deliver, false);
  assert.equal(shouldDeliverPush({ prefs, kind: "lead_interest" }).deliver, true);
});

test("shouldDeliverPush permite inbound on por defecto", () => {
  const result = shouldDeliverPush({
    prefs: DEFAULT_NOTIFICATION_PREFERENCES,
    kind: "new_inbound_message",
  });
  assert.equal(result.deliver, true);
});

test("shouldDeliverPush respeta inbound off", () => {
  const result = shouldDeliverPush({
    prefs: { ...DEFAULT_NOTIFICATION_PREFERENCES, notifyInboundMessages: false },
    kind: "new_inbound_message",
  });
  assert.equal(result.deliver, false);
  assert.equal(result.skippedReason, "kind_disabled");
});

test("shouldDeliverPush permite kinds desconocidos si master on", () => {
  const result = shouldDeliverPush({
    prefs: DEFAULT_NOTIFICATION_PREFERENCES,
    kind: "future_custom_kind",
  });
  assert.equal(result.deliver, true);
  assert.equal(result.skippedReason, undefined);
});

test("shouldDeliverPush permite kind vacio si master on", () => {
  assert.equal(shouldDeliverPush({ prefs: DEFAULT_NOTIFICATION_PREFERENCES, kind: "" }).deliver, true);
  assert.equal(shouldDeliverPush({ prefs: DEFAULT_NOTIFICATION_PREFERENCES, kind: null }).deliver, true);
});
