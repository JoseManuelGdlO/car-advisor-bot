import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import {
  exchangeEmbeddedSignupCode,
  graphRequest,
  ensurePlatformCanManageWaba,
} from "./metaGraphClient.js";
import { ApiError } from "../utils/errors.js";

const originalFetch = global.fetch;
const originalMeta = { ...env.meta };

test.afterEach(() => {
  global.fetch = originalFetch;
  Object.assign(env.meta, originalMeta);
});

test("graphRequest usa graphApiVersion en la URL", async () => {
  env.meta.graphApiVersion = "v21.0";
  let requestedUrl;
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return { ok: true, status: 200, text: async () => "{}" };
  };

  await graphRequest({ method: "GET", path: "me", token: "tok" });

  assert.match(requestedUrl, /^https:\/\/graph\.facebook\.com\/v21\.0\/me/);
});

test("exchangeEmbeddedSignupCode lanza ApiError 502 si Meta no devuelve access_token", async () => {
  env.meta.appId = "app-id";
  env.meta.appSecret = "app-secret";
  env.meta.graphApiVersion = "v21.0";

  let requestedUrl;
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return { ok: true, status: 200, text: async () => JSON.stringify({ token_type: "bearer" }) };
  };

  await assert.rejects(
    () => exchangeEmbeddedSignupCode("signup-code"),
    (err) => err instanceof ApiError && err.status === 502
  );

  const parsed = new URL(requestedUrl);
  assert.equal(parsed.pathname, "/v21.0/oauth/access_token");
  assert.equal(parsed.searchParams.get("client_id"), "app-id");
  assert.equal(parsed.searchParams.get("client_secret"), "app-secret");
  assert.equal(parsed.searchParams.get("code"), "signup-code");
});

test("graphRequest adjunta type details y fbtraceId en el error de Graph", async () => {
  env.meta.graphApiVersion = "v21.0";
  global.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () =>
      JSON.stringify({
        error: {
          message: "(#100) Invalid parameter",
          type: "GraphMethodException",
          code: 100,
          error_subcode: 33,
          error_data: { details: "Unsupported get request" },
          fbtrace_id: "trace-1",
        },
      }),
  });

  await assert.rejects(
    () => graphRequest({ method: "GET", path: "me", token: "tok" }),
    (err) => {
      assert.equal(err instanceof ApiError, true);
      assert.equal(err.status, 400);
      assert.equal(err.meta.code, 100);
      assert.equal(err.meta.subcode, 33);
      assert.equal(err.meta.type, "GraphMethodException");
      assert.equal(err.meta.details, "Unsupported get request");
      assert.equal(err.meta.fbtraceId, "trace-1");
      assert.equal(err.meta.message, "(#100) Invalid parameter");
      return true;
    }
  );
});

test("ensurePlatformCanManageWaba no lanza si el share OBO falla", async () => {
  env.meta.accessToken = "platform-token";
  env.meta.businessId = "biz-1";
  env.meta.systemUserId = "sys-1";
  env.meta.graphApiVersion = "v21.0";

  global.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({ error: { message: "permission denied", code: 10 } }),
  });

  const result = await ensurePlatformCanManageWaba({
    wabaId: "waba-1",
    plannerAccessToken: "planner-token",
  });

  assert.equal(result.skipped, false);
  assert.equal(result.shared, false);
  assert.equal(result.assigned, false);
});
