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
  listMessageTemplates,
  subscribeWabaApp,
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

  const authorizations = [];
  global.fetch = async (url, options) => {
    authorizations.push({
      url: String(url),
      authorization: options?.headers?.Authorization || "",
    });
    return {
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: "permission denied", code: 10 } }),
    };
  };

  const result = await ensurePlatformCanManageWaba({ wabaId: "waba-1" });

  const share = authorizations.find((row) => row.url.includes("/client_whatsapp_business_accounts"));
  const assign = authorizations.find((row) => row.url.includes("/assigned_users"));
  assert.equal(share?.authorization, "Bearer platform-token");
  assert.equal(assign?.authorization, "Bearer platform-token");

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
            user_id: "122107787031477352",
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
  assert.equal(result.userId, "122107787031477352");
  assert.deepEqual(result.targetIds, ["waba_1"]);
});

test("ensurePlatformCanManageWaba asigna el user_id de debug_token y no el ID configurado", async () => {
  env.meta.accessToken = "platform-token";
  env.meta.businessId = "";
  env.meta.systemUserId = "61594320585005";
  env.meta.appId = "app-id";
  env.meta.appSecret = "app-secret";
  env.meta.graphApiVersion = "v21.0";

  const calls = [];
  global.fetch = async (url) => {
    const requested = String(url);
    calls.push(requested);
    if (requested.includes("debug_token")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: { type: "SYSTEM_USER", is_valid: true, user_id: "122107787031477352", granular_scopes: [] },
          }),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
  };

  const result = await ensurePlatformCanManageWaba({ wabaId: "waba-1" });
  const assign = calls.find((url) => url.includes("/assigned_users"));
  assert.ok(assign);
  const parsed = new URL(assign);
  assert.equal(parsed.searchParams.get("user"), "122107787031477352");
  assert.equal(parsed.searchParams.get("user") === "61594320585005", false);
  assert.equal(result.assigned, true);
});

test("subscribeWabaApp suscribe message_template_status_update junto con messages", async () => {
  env.meta.appId = "app-id";
  env.meta.appSecret = "app-secret";
  env.meta.graphApiVersion = "v21.0";
  env.meta.webhookVerifyToken = "verify-me";
  const previousPublicUrl = process.env.BACKEND_PUBLIC_URL;
  process.env.BACKEND_PUBLIC_URL = "https://api.example.com";

  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({
      url: String(url),
      method: options?.method || "GET",
      body: options?.body ? JSON.parse(String(options.body)) : null,
    });
    if (String(url).includes("/subscriptions") && (options?.method || "GET") === "GET") {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              {
                object: "whatsapp_business_account",
                callback_url: "https://api.example.com/webhooks/meta/whatsapp",
                fields: [{ name: "messages" }],
              },
            ],
          }),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
  };

  try {
    await subscribeWabaApp("waba-1", "dealer-token");

    const appSub = calls.find((row) => row.url.includes("/app-id/subscriptions") && row.method === "POST");
    assert.ok(appSub);
    assert.equal(appSub.body.object, "whatsapp_business_account");
    assert.equal(appSub.body.callback_url, "https://api.example.com/webhooks/meta/whatsapp");
    assert.match(appSub.body.fields, /messages/);
    assert.match(appSub.body.fields, /message_template_status_update/);
    const wabaSub = calls.find((row) => row.url.includes("/waba-1/subscribed_apps"));
    assert.equal(wabaSub?.method, "POST");
  } finally {
    if (previousPublicUrl == null) delete process.env.BACKEND_PUBLIC_URL;
    else process.env.BACKEND_PUBLIC_URL = previousPublicUrl;
  }
});

test("listMessageTemplates lee las plantillas del WABA", async () => {
  env.meta.graphApiVersion = "v21.0";
  let requestedUrl;
  global.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          data: [{ id: "tmpl-1", name: "cab_sg_abcd1234", status: "APPROVED", language: "es_MX" }],
        }),
    };
  };

  const rows = await listMessageTemplates({ wabaId: "waba-1", token: "dealer-token" });
  const parsed = new URL(requestedUrl);
  assert.equal(parsed.pathname, "/v21.0/waba-1/message_templates");
  assert.match(parsed.searchParams.get("fields") || "", /status/);
  assert.equal(rows[0].name, "cab_sg_abcd1234");
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
