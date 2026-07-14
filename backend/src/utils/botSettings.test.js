import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "./errors.js";
import { isWithinBotSchedule, normalizeBotSettingsPayload, normalizeWeeklySchedule, validateTimezone } from "./botSettings.js";

test("normalizeWeeklySchedule rejects overlaps", () => {
  assert.throws(
    () =>
      normalizeWeeklySchedule({
        monday: [
          { start: "08:00", end: "10:00" },
          { start: "09:30", end: "12:00" },
        ],
      }),
    ApiError
  );
});

test("validateTimezone canonicalizes case-insensitive timezone ids", () => {
  assert.equal(validateTimezone("america/monterrey"), "America/Monterrey");
});

test("validateTimezone rejects invalid timezone", () => {
  assert.throws(() => validateTimezone("Invalid/Timezone"), ApiError);
});

test("isWithinBotSchedule returns true during configured range", () => {
  const enabled = isWithinBotSchedule(
    {
      isEnabled: true,
      timezone: "America/Bogota",
      weeklySchedule: {
        monday: [{ start: "09:00", end: "12:00" }],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      },
    },
    new Date("2026-04-20T15:00:00.000Z")
  );
  assert.equal(enabled, true);
});

test("isWithinBotSchedule returns false outside configured range", () => {
  const enabled = isWithinBotSchedule(
    {
      isEnabled: true,
      timezone: "America/Bogota",
      weeklySchedule: {
        monday: [{ start: "09:00", end: "12:00" }],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      },
    },
    new Date("2026-04-20T18:00:00.000Z")
  );
  assert.equal(enabled, false);
});

test("normalizeBotSettingsPayload rejects botName longer than 40 chars", () => {
  assert.throws(
    () => normalizeBotSettingsPayload({ botName: "a".repeat(41) }),
    ApiError
  );
});

test("normalizeBotSettingsPayload accepts empty botName and message fields", () => {
  const result = normalizeBotSettingsPayload({
    botName: "",
    welcomeMessage: "",
    faqFallbackMessage: "",
  });
  assert.deepEqual(result, {
    botName: "",
    welcomeMessage: "",
    faqFallbackMessage: "",
  });
});

test("normalizeBotSettingsPayload accepts downPaymentMessage text and normalizes empty to null", () => {
  const result = normalizeBotSettingsPayload({
    downPaymentMessage: "  El enganche minimo es del 15%  ",
  });
  assert.equal(result.downPaymentMessage, "El enganche minimo es del 15%");

  assert.deepEqual(normalizeBotSettingsPayload({ downPaymentMessage: "" }), {
    downPaymentMessage: null,
  });
  assert.deepEqual(normalizeBotSettingsPayload({ downPaymentMessage: null }), {
    downPaymentMessage: null,
  });
});

test("normalizeBotSettingsPayload rejects downPaymentMessage longer than max length", () => {
  assert.throws(
    () => normalizeBotSettingsPayload({ downPaymentMessage: "a".repeat(2001) }),
    ApiError
  );
});

test("normalizeBotSettingsPayload accepts visitIncentiveMessage text and normalizes empty to null", () => {
  const result = normalizeBotSettingsPayload({
    visitIncentiveMessage: "  Visitanos en la agencia  ",
  });
  assert.equal(result.visitIncentiveMessage, "Visitanos en la agencia");

  assert.deepEqual(normalizeBotSettingsPayload({ visitIncentiveMessage: "" }), {
    visitIncentiveMessage: null,
  });
  assert.deepEqual(normalizeBotSettingsPayload({ visitIncentiveMessage: null }), {
    visitIncentiveMessage: null,
  });
});

test("normalizeBotSettingsPayload rejects visitIncentiveMessage longer than max length", () => {
  assert.throws(
    () => normalizeBotSettingsPayload({ visitIncentiveMessage: "a".repeat(2001) }),
    ApiError
  );
});
