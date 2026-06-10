import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarSchedulingUrlSchema,
  isGoogleCalendarSchedulingUrl,
} from "./calendarUrl.js";

test("isGoogleCalendarSchedulingUrl accepts calendar.app.google links", () => {
  assert.equal(
    isGoogleCalendarSchedulingUrl("https://calendar.app.google/tYniJNfcrd8qXvut8"),
    true,
  );
});

test("isGoogleCalendarSchedulingUrl accepts calendar.google.com links", () => {
  assert.equal(
    isGoogleCalendarSchedulingUrl("https://calendar.google.com/calendar/appointments/schedules/abc"),
    true,
  );
});

test("isGoogleCalendarSchedulingUrl rejects non-google hosts", () => {
  assert.equal(isGoogleCalendarSchedulingUrl("https://example.com/agenda"), false);
  assert.equal(isGoogleCalendarSchedulingUrl("http://calendar.app.google/foo"), false);
});

test("calendarSchedulingUrlSchema rejects invalid urls", () => {
  const parsed = calendarSchedulingUrlSchema.safeParse("https://example.com/agenda");
  assert.equal(parsed.success, false);
});

test("calendarSchedulingUrlSchema accepts valid urls", () => {
  const parsed = calendarSchedulingUrlSchema.safeParse("https://calendar.app.google/abc123");
  assert.equal(parsed.success, true);
  assert.equal(parsed.data, "https://calendar.app.google/abc123");
});
