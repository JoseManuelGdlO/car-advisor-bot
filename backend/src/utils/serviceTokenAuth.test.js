import test from "node:test";
import assert from "node:assert/strict";
import { matchesBackendServiceToken, authAsPlatformService } from "./serviceTokenAuth.js";
import { env } from "../config/env.js";

test("matchesBackendServiceToken compares configured env token", () => {
  const previous = env.service.backendServiceToken;
  env.service.backendServiceToken = "test-platform-secret";
  try {
    assert.equal(matchesBackendServiceToken("test-platform-secret"), true);
    assert.equal(matchesBackendServiceToken("wrong-secret"), false);
  } finally {
    env.service.backendServiceToken = previous;
  }
});

test("authAsPlatformService returns platform scope", () => {
  const auth = authAsPlatformService();
  assert.equal(auth.type, "service");
  assert.equal(auth.scope, "platform");
  assert.equal(auth.userId, null);
  assert.ok(auth.scopes.includes("platform:bot"));
});
