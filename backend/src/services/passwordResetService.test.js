import test from "node:test";
import assert from "node:assert/strict";
import {
  buildResetExpiresAt,
  generateResetCode,
  isResetAttemptsExceeded,
  isResetCodeExpired,
  resolveResetCodeMatch,
} from "./passwordResetService.js";
import { sha256 } from "../utils/auth.js";

test("generateResetCode returns 6 digit string in full 000000-999999 range", () => {
  for (let i = 0; i < 100; i++) {
    const code = generateResetCode();
    assert.match(code, /^\d{6}$/);
    assert.ok(Number(code) >= 0 && Number(code) <= 999_999);
  }
});

test("buildResetExpiresAt adds ttl minutes", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");
  const expiresAt = buildResetExpiresAt(now, 15);
  assert.equal(expiresAt.toISOString(), "2026-07-07T12:15:00.000Z");
});

test("isResetCodeExpired is true when expiresAt is in the past", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");
  const expiresAt = new Date("2026-07-07T11:59:59.000Z");
  assert.equal(isResetCodeExpired(expiresAt, now), true);
});

test("isResetAttemptsExceeded respects max attempts", () => {
  assert.equal(isResetAttemptsExceeded(4, 5), false);
  assert.equal(isResetAttemptsExceeded(5, 5), true);
});

test("resolveResetCodeMatch compares sha256 hash", () => {
  const code = "123456";
  assert.equal(resolveResetCodeMatch(code, sha256(code)), true);
  assert.equal(resolveResetCodeMatch("654321", sha256(code)), false);
});
