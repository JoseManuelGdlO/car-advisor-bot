import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import {
  createMessageTemplate,
  exchangeEmbeddedSignupCode,
  graphRequest,
  ensurePlatformCanManageWaba,
  initiateCoexistenceSync,
  inspectGraphToken,
  updateMessageTemplate,
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
  assert.equal(parsed.searchParams.get("redirect_uri"), null);
});

test("exchangeEmbeddedSignupCode repite el redirect_uri del diálogo", async () => {
  env.meta.appId = "app-id";
  env.meta.appSecret = "app-secret";
  env.meta.graphApiVersion = "v21.0";

  let requestedUrl;
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "EAA_TOKEN" }) };
  };

  await exchangeEmbeddedSignupCode("signup-code", "https://api.example.com/whatsapp-signup");

  const parsed = new URL(requestedUrl);
  assert.equal(parsed.searchParams.get("redirect_uri"), "https://api.example.com/whatsapp-signup");
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

test("createMessageTemplate POST /{wabaId}/message_templates con el payload y el token del caller", async () => {
  env.meta.graphApiVersion = "v21.0";
  env.meta.accessToken = "platform-token";

  const payload = {
    name: "cab_sg_abcd1234",
    language: "es_MX",
    category: "MARKETING",
    components: [{ type: "BODY", text: "Hola, ¿sigues interesado?" }],
  };

  let calledUrl;
  let calledMethod;
  let calledHeaders;
  let calledBody;
  global.fetch = async (url, options) => {
    calledUrl = String(url);
    calledMethod = options?.method;
    calledHeaders = options?.headers || {};
    calledBody = JSON.parse(String(options?.body || "{}"));
    return { ok: true, status: 200, text: async () => JSON.stringify({ id: "tmpl-1" }) };
  };

  const result = await createMessageTemplate({
    wabaId: "waba-123",
    token: "dealer-token",
    payload,
  });

  assert.match(calledUrl, /^https:\/\/graph\.facebook\.com\/v21\.0\/waba-123\/message_templates/);
  assert.equal(calledMethod, "POST");
  assert.equal(calledHeaders.Authorization, "Bearer dealer-token");
  assert.deepEqual(calledBody, payload);
  assert.equal(result.id, "tmpl-1");
});

test("updateMessageTemplate POST /{templateId} con el payload y el token del caller", async () => {
  env.meta.graphApiVersion = "v21.0";
  env.meta.accessToken = "platform-token";

  const payload = {
    language: "es_MX",
    category: "MARKETING",
    components: [{ type: "BODY", text: "Cuerpo actualizado" }],
  };

  let calledUrl;
  let calledMethod;
  let calledHeaders;
  let calledBody;
  global.fetch = async (url, options) => {
    calledUrl = String(url);
    calledMethod = options?.method;
    calledHeaders = options?.headers || {};
    calledBody = JSON.parse(String(options?.body || "{}"));
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
  };

  const result = await updateMessageTemplate({
    templateId: "graph-template-99",
    token: "dealer-token",
    payload,
  });

  assert.match(calledUrl, /^https:\/\/graph\.facebook\.com\/v21\.0\/graph-template-99(?:\?|$)/);
  assert.doesNotMatch(calledUrl, /message_templates/);
  assert.equal(calledMethod, "POST");
  assert.equal(calledHeaders.Authorization, "Bearer dealer-token");
  assert.deepEqual(calledBody, payload);
  assert.equal(result.success, true);
});

test("inspectGraphToken llama debug_token con el app token y resume el data", async () => {
  env.meta.appId = "app-id";
  env.meta.appSecret = "app-secret";
  env.meta.graphApiVersion = "v21.0";

  let requestedUrl;
  let requestedHeaders;
  global.fetch = async (url, options) => {
    requestedUrl = String(url);
    requestedHeaders = options?.headers || {};
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          data: {
            type: "USER",
            is_valid: true,
            expires_at: 1800000000,
            data_access_expires_at: 1800000001,
            scopes: ["whatsapp_business_management"],
            granular_scopes: [{ target_ids: ["waba_1", "waba_1"] }],
          },
        }),
    };
  };

  const result = await inspectGraphToken("EAA_USER");
  const parsed = new URL(requestedUrl);
  assert.equal(parsed.pathname, "/v21.0/debug_token");
  assert.equal(parsed.searchParams.get("input_token"), "EAA_USER");
  assert.equal(requestedHeaders.Authorization, "Bearer app-id|app-secret");
  assert.equal(result.type, "USER");
  assert.equal(result.isValid, true);
  assert.equal(result.expiresAt, 1800000000);
  assert.equal(result.dataAccessExpiresAt, 1800000001);
  assert.deepEqual(result.scopes, ["whatsapp_business_management"]);
  assert.deepEqual(result.targetIds, ["waba_1"]);
});

test("initiateCoexistenceSync hace POST smb_app_data con sync_type", async () => {
  env.meta.graphApiVersion = "v21.0";

  let calledUrl;
  let calledMethod;
  let calledHeaders;
  let calledBody;
  global.fetch = async (url, options) => {
    calledUrl = String(url);
    calledMethod = options?.method;
    calledHeaders = options?.headers || {};
    calledBody = JSON.parse(String(options?.body || "{}"));
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
  };

  const result = await initiateCoexistenceSync({
    phoneNumberId: "pn_1",
    token: "dealer-token",
    syncType: "smb_app_state_sync",
  });

  assert.equal(calledUrl, "https://graph.facebook.com/v21.0/pn_1/smb_app_data");
  assert.equal(calledMethod, "POST");
  assert.equal(calledHeaders.Authorization, "Bearer dealer-token");
  assert.deepEqual(calledBody, {
    messaging_product: "whatsapp",
    sync_type: "smb_app_state_sync",
  });
  assert.equal(result.success, true);
});
