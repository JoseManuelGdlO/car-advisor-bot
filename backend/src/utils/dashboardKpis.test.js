import test from "node:test";
import assert from "node:assert/strict";
import { calcDayOverDayChangePct, utcDayBounds } from "./dashboardKpis.js";

test("calcDayOverDayChangePct returns rounded percent increase", () => {
  assert.equal(calcDayOverDayChangePct(3, 2), 50);
});

test("calcDayOverDayChangePct returns 0 when both days are 0", () => {
  assert.equal(calcDayOverDayChangePct(0, 0), 0);
});

test("calcDayOverDayChangePct returns 0 when yesterday is 0", () => {
  assert.equal(calcDayOverDayChangePct(5, 0), 0);
});

test("calcDayOverDayChangePct returns negative percent for decrease", () => {
  assert.equal(calcDayOverDayChangePct(3, 4), -25);
});

test("utcDayBounds returns UTC start and end for today", () => {
  const now = new Date("2026-07-07T15:30:00.000Z");
  const { start, end } = utcDayBounds(now, 0);
  assert.equal(start.toISOString(), "2026-07-07T00:00:00.000Z");
  assert.equal(end.toISOString(), "2026-07-07T23:59:59.999Z");
});

test("utcDayBounds returns UTC window for yesterday", () => {
  const now = new Date("2026-07-07T15:30:00.000Z");
  const { start, end } = utcDayBounds(now, -1);
  assert.equal(start.toISOString(), "2026-07-06T00:00:00.000Z");
  assert.equal(end.toISOString(), "2026-07-06T23:59:59.999Z");
});
