import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "./errors.js";
import { isWithinBotSchedule, normalizeWeeklySchedule, validateTimezone } from "./botSettings.js";

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
