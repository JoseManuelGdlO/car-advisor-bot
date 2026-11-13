import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import { ChannelCredential, ChannelIntegration } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { encryptCredentialsPayload } from "../utils/credentialsCrypto.js";
import { completeEmbeddedSignup, disconnectMetaWhatsapp, publicMetaSignupConfig } from "./metaSignupService.js";

const originalFetch = global.fetch;
const originalMeta = { ...env.meta };
const originalIntegrationFindOne = ChannelIntegration.findOne;
const originalIntegrationFindAll = ChannelIntegration.findAll;
const originalIntegrationCreate = ChannelIntegration.create;
const originalCredentialFindOne = ChannelCredential.findOne;
const originalCredentialUpdate = ChannelCredential.update;
const originalCredentialCreate = ChannelCredential.create;

test.afterEach(() => {
  global.fetch = originalFetch;
  Object.assign(env.meta, originalMeta);
  ChannelIntegration.findOne = originalIntegrationFindOne;
  ChannelIntegration.findAll = originalIntegrationFindAll;
  ChannelIntegration.create = originalIntegrationCreate;
  ChannelCredential.findOne = originalCredentialFindOne;
  ChannelCredential.update = originalCredentialUpdate;
  ChannelCredential.create = originalCredentialCreate;
});

test("publicMetaSignupConfig configured es false si falta appId", () => {
  env.meta.appId = "";
  env.meta.configId = "cfg";
  env.meta.appSecret = "secret";
  const config = publicMetaSignupConfig();
  assert.equal(config.configured, false);
  assert.equal(config.featureType, "whatsapp_business_app_onboarding");
  assert.equal(config.sessionInfoVersion, "3");
  assert.equal(JSON.stringify(config).includes("secret"), false);
});

test("publicMetaSignupConfig configured es true solo con appId, configId y appSecret", () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.graphApiVersion = "v21.0";
  const config = publicMetaSignupConfig();
  assert.equal(config.configured, true);
  assert.equal(config.appId, "app-id");
  assert.equal(config.configId, "cfg-id");
  assert.equal(config.graphVersion, "v21.0");
  assert.equal(config.featureType, "whatsapp_business_app_onboarding");
  assert.equal(config.sessionInfoVersion, "3");
  assert.equal(JSON.stringify(config).includes("app-secret"), false);
});

test("completeEmbeddedSignup 400 si falta wabaId y el token no trae uno", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.accessToken = "";
  let exchangeCalled = false;
  global.fetch = async (url) => {
    if (String(url).includes("oauth/access_token")) {
      exchangeCalled = true;
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "EAA_TOKEN" }) };
    }
    if (String(url).includes("debug_token")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { type: "USER", is_valid: true, granular_scopes: [] } }),
      };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };

  await assert.rejects(
    () => completeEmbeddedSignup({ ownerUserId: "owner-1", code: "AUTH_CODE" }),
    (err) =>
      err instanceof ApiError &&
      err.status === 400 &&
      err.message === "Meta no devolvió el WABA ID. Completa de nuevo el flujo.",
  );
  assert.equal(exchangeCalled, true);
});

test("completeEmbeddedSignup sin wabaId usa el único target id del token", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.accessToken = "";

  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("oauth/access_token")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "EAA_TOKEN" }) };
    }
    if (u.includes("debug_token")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: {
              type: "USER",
              is_valid: true,
              granular_scopes: [
                { scope: "whatsapp_business_management", target_ids: ["waba_from_token"] },
                { scope: "whatsapp_business_messaging", target_ids: ["waba_from_token"] },
              ],
            },
          }),
      };
    }
    if (u.includes("/subscribed_apps")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
    }
    if (u.includes("/phone_numbers")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [{ id: "pn_1", display_phone_number: "+52 618 123 4567", platform_type: "CLOUD_API" }],
          }),
      };
    }
    if (u.includes("/pn_1")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ id: "pn_1", display_phone_number: "+52 618 123 4567", platform_type: "CLOUD_API" }),
      };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };

  ChannelIntegration.findAll = async () => [];
  ChannelIntegration.findOne = async () => null;
  let created;
  ChannelIntegration.create = async (data) => {
    created = { id: "int_meta", ...data, update: async (patch) => Object.assign(created, patch) };
    return created;
  };
  ChannelCredential.update = async () => [1];
  ChannelCredential.create = async (data) => ({ id: "cred_meta", ...data });

  const result = await completeEmbeddedSignup({
    ownerUserId: "owner-1",
    code: "AUTH_CODE",
    ensureFollowupDefault: async () => ({ created: false }),
  });

  assert.equal(created.wabaId, "waba_from_token");
  assert.equal(result.provider, "meta");
});

test("completeEmbeddedSignup sin wabaId elige el único target id que lista números", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.accessToken = "";

  const probed = [];
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("oauth/access_token")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "EAA_TOKEN" }) };
    }
    if (u.includes("debug_token")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: {
              type: "SYSTEM_USER",
              is_valid: true,
              granular_scopes: [
                { scope: "whatsapp_business_management", target_ids: ["1300797345181712", "1704339514009532"] },
              ],
            },
          }),
      };
    }
    if (u.includes("/phone_numbers")) {
      probed.push(u);
      if (u.includes("1704339514009532/phone_numbers")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              data: [{ id: "1166184433254184", display_phone_number: "+52 1 624 184 7941" }],
            }),
        };
      }
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: "Unsupported get request.", code: 100 } }),
      };
    }
    if (u.includes("/subscribed_apps")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
    }
    if (u.includes("1166184433254184")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ id: "1166184433254184", display_phone_number: "+52 1 624 184 7941" }),
      };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };

  ChannelIntegration.findAll = async () => [];
  ChannelIntegration.findOne = async () => null;
  let created;
  ChannelIntegration.create = async (data) => {
    created = { id: "int_meta", ...data, update: async (patch) => Object.assign(created, patch) };
    return created;
  };
  ChannelCredential.update = async () => [1];
  ChannelCredential.create = async (data) => ({ id: "cred_meta", ...data });

  await completeEmbeddedSignup({
    ownerUserId: "owner-1",
    code: "AUTH_CODE",
    ensureFollowupDefault: async () => ({ created: false }),
  });

  assert.equal(created.wabaId, "1704339514009532");
  assert.equal(created.phoneNumberId, "1166184433254184");
  assert.ok(probed.some((url) => url.includes("1704339514009532/phone_numbers")));
  assert.ok(probed.some((url) => url.includes("1300797345181712/phone_numbers")));
});

test("completeEmbeddedSignup sin wabaId usa el target id que contiene el phoneNumberId", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.accessToken = "";

  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("oauth/access_token")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "EAA_TOKEN" }) };
    }
    if (u.includes("debug_token")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: {
              type: "SYSTEM_USER",
              is_valid: true,
              granular_scopes: [
                { scope: "whatsapp_business_management", target_ids: ["waba_a", "waba_b"] },
              ],
            },
          }),
      };
    }
    if (u.includes("waba_a/phone_numbers")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [{ id: "pn_a", display_phone_number: "+52 1" }] }),
      };
    }
    if (u.includes("waba_b/phone_numbers")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [{ id: "pn_b", display_phone_number: "+52 2" }] }),
      };
    }
    if (u.includes("/subscribed_apps")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
    }
    if (u.includes("pn_b")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "pn_b", display_phone_number: "+52 2" }),
      };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };

  ChannelIntegration.findAll = async () => [];
  ChannelIntegration.findOne = async () => null;
  let created;
  ChannelIntegration.create = async (data) => {
    created = { id: "int_meta", ...data, update: async (patch) => Object.assign(created, patch) };
    return created;
  };
  ChannelCredential.update = async () => [1];
  ChannelCredential.create = async (data) => ({ id: "cred_meta", ...data });

  await completeEmbeddedSignup({
    ownerUserId: "owner-1",
    code: "AUTH_CODE",
    phoneNumberId: "pn_b",
    ensureFollowupDefault: async () => ({ created: false }),
  });

  assert.equal(created.wabaId, "waba_b");
  assert.equal(created.phoneNumberId, "pn_b");
});

test("completeEmbeddedSignup sin wabaId elige el número dado de alta más tarde", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.accessToken = "";

  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("oauth/access_token")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "EAA_TOKEN" }) };
    }
    if (u.includes("debug_token")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: {
              type: "SYSTEM_USER",
              is_valid: true,
              granular_scopes: [
                { scope: "whatsapp_business_management", target_ids: ["1300797345181712", "1704339514009532"] },
              ],
            },
          }),
      };
    }
    if (u.includes("1300797345181712/phone_numbers")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              {
                id: "pn_old",
                display_phone_number: "+52 1 000 000 0000",
                last_onboarded_time: "2024-01-01T00:00:00+0000",
              },
            ],
          }),
      };
    }
    if (u.includes("1704339514009532/phone_numbers")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              {
                id: "1166184433254184",
                display_phone_number: "+52 1 624 184 7941",
                last_onboarded_time: "2026-11-13T02:29:00+0000",
              },
            ],
          }),
      };
    }
    if (u.includes("/subscribed_apps")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
    }
    if (u.includes("1166184433254184")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ id: "1166184433254184", display_phone_number: "+52 1 624 184 7941" }),
      };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };

  ChannelIntegration.findAll = async () => [];
  ChannelIntegration.findOne = async () => null;
  let created;
  ChannelIntegration.create = async (data) => {
    created = { id: "int_meta", ...data, update: async (patch) => Object.assign(created, patch) };
    return created;
  };
  ChannelCredential.update = async () => [1];
  ChannelCredential.create = async (data) => ({ id: "cred_meta", ...data });

  await completeEmbeddedSignup({
    ownerUserId: "owner-1",
    code: "AUTH_CODE",
    ensureFollowupDefault: async () => ({ created: false }),
  });

  assert.equal(created.wabaId, "1704339514009532");
  assert.equal(created.phoneNumberId, "1166184433254184");
});

test("completeEmbeddedSignup sin wabaId entiende last_onboarded_time en segundos unix", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.accessToken = "";
  env.meta.businessId = "";

  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("oauth/access_token")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "EAA_TOKEN" }) };
    }
    if (u.includes("debug_token")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: {
              type: "SYSTEM_USER",
              is_valid: true,
              granular_scopes: [
                { scope: "whatsapp_business_management", target_ids: ["waba_old", "waba_new"] },
              ],
            },
          }),
      };
    }
    if (u.includes("waba_old/phone_numbers")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ data: [{ id: "pn_old", display_phone_number: "+1", last_onboarded_time: 1700000000 }] }),
      };
    }
    if (u.includes("waba_new/phone_numbers")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ data: [{ id: "pn_new", display_phone_number: "+2", last_onboarded_time: 1763000000 }] }),
      };
    }
    if (u.includes("/subscribed_apps")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
    }
    if (u.includes("pn_new")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "pn_new", display_phone_number: "+2" }),
      };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };

  ChannelIntegration.findAll = async () => [];
  ChannelIntegration.findOne = async () => null;
  let created;
  ChannelIntegration.create = async (data) => {
    created = { id: "int_meta", ...data, update: async (patch) => Object.assign(created, patch) };
    return created;
  };
  ChannelCredential.update = async () => [1];
  ChannelCredential.create = async (data) => ({ id: "cred_meta", ...data });

  await completeEmbeddedSignup({
    ownerUserId: "owner-1",
    code: "AUTH_CODE",
    ensureFollowupDefault: async () => ({ created: false }),
  });

  assert.equal(created.wabaId, "waba_new");
});

test("completeEmbeddedSignup sin fecha descarta el WABA propio del portafolio", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.accessToken = "platform-token";
  env.meta.businessId = "biz-intelekia";

  const requested = [];
  global.fetch = async (url) => {
    const u = String(url);
    requested.push(u);
    if (u.includes("oauth/access_token")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "EAA_TOKEN" }) };
    }
    if (u.includes("debug_token")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: {
              type: "SYSTEM_USER",
              is_valid: true,
              granular_scopes: [
                { scope: "whatsapp_business_management", target_ids: ["1300797345181712", "1704339514009532"] },
              ],
            },
          }),
      };
    }
    if (u.includes("owned_whatsapp_business_accounts")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [{ id: "1300797345181712" }] }),
      };
    }
    if (u.includes("1300797345181712/phone_numbers")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [{ id: "pn_partner", display_phone_number: "+52 1 000" }] }),
      };
    }
    if (u.includes("1704339514009532/phone_numbers")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ data: [{ id: "1166184433254184", display_phone_number: "+52 1 624 184 7941" }] }),
      };
    }
    if (u.includes("/subscribed_apps")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
    }
    if (u.includes("1166184433254184")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "1166184433254184", display_phone_number: "+52 1 624 184 7941" }),
      };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };

  ChannelIntegration.findAll = async () => [];
  ChannelIntegration.findOne = async () => null;
  let created;
  ChannelIntegration.create = async (data) => {
    created = { id: "int_meta", ...data, update: async (patch) => Object.assign(created, patch) };
    return created;
  };
  ChannelCredential.update = async () => [1];
  ChannelCredential.create = async (data) => ({ id: "cred_meta", ...data });

  await completeEmbeddedSignup({
    ownerUserId: "owner-1",
    code: "AUTH_CODE",
    ensureFollowupDefault: async () => ({ created: false }),
  });

  assert.equal(created.wabaId, "1704339514009532");
  assert.ok(requested.some((url) => url.includes("owned_whatsapp_business_accounts")));
});

test("completeEmbeddedSignup sin fecha elige el número que sigue en la app de WhatsApp Business", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.accessToken = "";
  env.meta.businessId = "";

  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("oauth/access_token")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "EAA_TOKEN" }) };
    }
    if (u.includes("debug_token")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: {
              type: "SYSTEM_USER",
              is_valid: true,
              granular_scopes: [
                { scope: "whatsapp_business_management", target_ids: ["1300797345181712", "1704339514009532"] },
              ],
            },
          }),
      };
    }
    if (u.includes("1300797345181712/phone_numbers")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              {
                id: "854807567712136",
                display_phone_number: "+52 1 612 200 6803",
                is_on_biz_app: false,
                platform_type: "CLOUD_API",
              },
            ],
          }),
      };
    }
    if (u.includes("1704339514009532/phone_numbers")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              {
                id: "1166184433254184",
                display_phone_number: "+52 1 624 184 7941",
                is_on_biz_app: true,
                platform_type: "CLOUD_API",
              },
            ],
          }),
      };
    }
    if (u.includes("/subscribed_apps")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
    }
    if (u.includes("1166184433254184")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "1166184433254184",
            display_phone_number: "+52 1 624 184 7941",
            is_on_biz_app: true,
            platform_type: "CLOUD_API",
          }),
      };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };

  ChannelIntegration.findAll = async () => [];
  ChannelIntegration.findOne = async () => null;
  let created;
  ChannelIntegration.create = async (data) => {
    created = { id: "int_meta", ...data, update: async (patch) => Object.assign(created, patch) };
    return created;
  };
  ChannelCredential.update = async () => [1];
  ChannelCredential.create = async (data) => ({ id: "cred_meta", ...data });

  await completeEmbeddedSignup({
    ownerUserId: "owner-1",
    code: "AUTH_CODE",
    ensureFollowupDefault: async () => ({ created: false }),
  });

  assert.equal(created.wabaId, "1704339514009532");
  assert.equal(created.phoneNumberId, "1166184433254184");
  assert.equal(created.coexistenceEnabled, true);
});

test("completeEmbeddedSignup 400 si varios target ids tienen números y no hay phoneNumberId", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.accessToken = "";

  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("oauth/access_token")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "EAA_TOKEN" }) };
    }
    if (u.includes("debug_token")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: {
              type: "SYSTEM_USER",
              is_valid: true,
              granular_scopes: [
                { scope: "whatsapp_business_management", target_ids: ["waba_a", "waba_b"] },
              ],
            },
          }),
      };
    }
    if (u.includes("/phone_numbers")) {
      const id = u.includes("waba_a") ? "pn_a" : "pn_b";
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [{ id, display_phone_number: "+52" }] }),
      };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };

  let created = false;
  ChannelIntegration.create = async () => {
    created = true;
  };

  await assert.rejects(
    () =>
      completeEmbeddedSignup({
        ownerUserId: "owner-1",
        code: "AUTH_CODE",
        ensureFollowupDefault: async () => ({ created: false }),
      }),
    (err) =>
      err instanceof ApiError &&
      err.status === 400 &&
      err.message === "Meta no devolvió el WABA ID. Completa de nuevo el flujo.",
  );
  assert.equal(created, false);
});

test("completeEmbeddedSignup intercambia el código y guarda ChannelIntegration", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.accessToken = "";

  const requested = [];
  global.fetch = async (url, opts) => {
    requested.push({ url: String(url), method: opts?.method || "GET" });
    const u = String(url);
    if (u.includes("oauth/access_token")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "EAA_TOKEN" }) };
    }
    if (u.includes("/subscribed_apps")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
    }
    if (u.includes("/phone_numbers")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              {
                id: "pn_1",
                display_phone_number: "+52 618 123 4567",
                is_on_biz_app: true,
                platform_type: "CLOUD_API",
              },
            ],
          }),
      };
    }
    if (u.includes("/pn_1")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "pn_1",
            display_phone_number: "+52 618 123 4567",
            is_on_biz_app: true,
            platform_type: "CLOUD_API",
          }),
      };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };

  ChannelIntegration.findAll = async () => [];
  ChannelIntegration.findOne = async () => null;
  let created;
  ChannelIntegration.create = async (data) => {
    created = { id: "int_meta", ...data, update: async (patch) => Object.assign(created, patch) };
    return created;
  };
  ChannelCredential.update = async () => [1];
  let credCreated;
  ChannelCredential.create = async (data) => {
    credCreated = data;
    return { id: "cred_meta", ...data };
  };

  const ensureCalls = [];
  const ensureFollowupDefault = async (args) => {
    ensureCalls.push(args);
    return { created: true };
  };

  const result = await completeEmbeddedSignup({
    ownerUserId: "owner-1",
    code: "AUTH_CODE",
    wabaId: "waba_1",
    event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    ensureFollowupDefault,
  });

  assert.equal(created.ownerUserId, "owner-1");
  assert.equal(created.channel, "whatsapp");
  assert.equal(created.provider, "meta");
  assert.equal(created.phoneNumberId, "pn_1");
  assert.equal(created.wabaId, "waba_1");
  assert.equal(created.coexistenceEnabled, true);
  assert.equal(created.status, "active");
  assert.equal(credCreated.isActive, true);
  assert.ok(credCreated.cipherText);
  assert.equal(result.coexistenceEnabled, true);
  assert.equal(result.provider, "meta");
  assert.match(requested.find((r) => r.url.includes("oauth/access_token"))?.url || "", /oauth\/access_token/);
  assert.equal(ensureCalls.length, 1);
  assert.deepEqual(ensureCalls[0], {
    ownerUserId: "owner-1",
    wabaId: "waba_1",
    accessToken: "EAA_TOKEN",
  });
});

function mockGraphSignupFetch({ smbStatus = 200, debugStatus = 200, onBizApp = true } = {}) {
  const requested = [];
  global.fetch = async (url, opts) => {
    const u = String(url);
    requested.push({ url: u, method: opts?.method || "GET", body: opts?.body || null });
    if (u.includes("oauth/access_token")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "EAA_TOKEN" }) };
    }
    if (u.includes("debug_token")) {
      const ok = debugStatus >= 200 && debugStatus < 300;
      return {
        ok,
        status: debugStatus,
        text: async () =>
          ok
            ? JSON.stringify({ data: { type: "USER", is_valid: true, granular_scopes: [] } })
            : JSON.stringify({ error: { message: "debug failed", code: 190 } }),
      };
    }
    if (u.includes("/subscribed_apps")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
    }
    if (u.includes("/smb_app_data")) {
      const ok = smbStatus >= 200 && smbStatus < 300;
      return {
        ok,
        status: smbStatus,
        text: async () =>
          ok
            ? JSON.stringify({ success: true })
            : JSON.stringify({ error: { message: "sync failed", code: 100 } }),
      };
    }
    if (u.includes("/phone_numbers")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              {
                id: "pn_1",
                display_phone_number: "+52 1",
                is_on_biz_app: onBizApp,
                platform_type: onBizApp ? "CLOUD_API" : "NOT_APPLICABLE",
              },
            ],
          }),
      };
    }
    if (u.includes("/pn_1")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "pn_1",
            display_phone_number: "+52 1",
            is_on_biz_app: onBizApp,
            platform_type: onBizApp ? "CLOUD_API" : "NOT_APPLICABLE",
          }),
      };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };
  return requested;
}

test("completeEmbeddedSignup devuelve el fallo de plantilla y no revierte credenciales", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.accessToken = "";
  mockGraphSignupFetch();

  ChannelIntegration.findAll = async () => [];
  ChannelIntegration.findOne = async () => null;
  let created;
  ChannelIntegration.create = async (data) => {
    created = { id: "int_meta", ...data, update: async (patch) => Object.assign(created, patch) };
    return created;
  };
  let credCreated;
  let credUpdateAfterCreate = false;
  ChannelCredential.update = async () => {
    if (credCreated) credUpdateAfterCreate = true;
    return [1];
  };
  ChannelCredential.create = async (data) => {
    credCreated = data;
    return { id: "cred_meta", ...data };
  };

  let ensureCalled = false;
  const ensureFollowupDefault = async (args) => {
    ensureCalled = true;
    assert.deepEqual(args, {
      ownerUserId: "owner-1",
      wabaId: "waba_1",
      accessToken: "EAA_TOKEN",
    });
    throw new Error("Graph down");
  };

  const result = await completeEmbeddedSignup({
    ownerUserId: "owner-1",
    code: "AUTH_CODE",
    wabaId: "waba_1",
    ensureFollowupDefault,
  });

  assert.equal(ensureCalled, true);
  assert.equal(result.provider, "meta");
  assert.equal(result.coexistenceEnabled, true);
  assert.match(result.followupTemplateError, /plantilla de seguimiento/);
  assert.match(result.followupTemplateError, /Graph down/);
  assert.equal(created.status, "active");
  assert.equal(created.lastError, result.followupTemplateError);
  assert.equal(credCreated.isActive, true);
  assert.equal(credUpdateAfterCreate, false);
});

test("completeEmbeddedSignup 409 si el número pertenece a otra cuenta", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.accessToken = "";
  mockGraphSignupFetch();
  ChannelIntegration.findAll = async () => [{ ownerUserId: "other-user", phoneNumberId: "pn_1" }];

  await assert.rejects(
    () =>
      completeEmbeddedSignup({
        ownerUserId: "owner-1",
        code: "AUTH_CODE",
        wabaId: "waba_1",
      }),
    (err) =>
      err instanceof ApiError &&
      err.status === 409 &&
      err.message === "Este número de WhatsApp ya está vinculado a otra cuenta."
  );
});

function stubFreshIntegration() {
  ChannelIntegration.findAll = async () => [];
  ChannelIntegration.findOne = async () => null;
  let created;
  ChannelIntegration.create = async (data) => {
    created = { id: "int_meta", ...data, update: async (patch) => Object.assign(created, patch) };
    return created;
  };
  let credCreated;
  ChannelCredential.update = async () => [1];
  ChannelCredential.create = async (data) => {
    credCreated = data;
    return { id: "cred_meta", ...data };
  };
  return {
    get created() {
      return created;
    },
    get credCreated() {
      return credCreated;
    },
  };
}

test("completeEmbeddedSignup con coexistencia hace POST smb_app_data y no revierte si el sync falla", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.accessToken = "";
  const requested = mockGraphSignupFetch({ smbStatus: 400 });
  const rows = stubFreshIntegration();

  const result = await completeEmbeddedSignup({
    ownerUserId: "owner-1",
    code: "AUTH_CODE",
    wabaId: "waba_1",
    event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    ensureFollowupDefault: async () => ({ created: true }),
  });

  const sync = requested.find((row) => row.url.includes("/smb_app_data"));
  assert.ok(sync);
  assert.equal(sync.method, "POST");
  assert.deepEqual(JSON.parse(sync.body), {
    messaging_product: "whatsapp",
    sync_type: "smb_app_state_sync",
  });
  assert.equal(result.coexistenceEnabled, true);
  assert.equal(rows.created.status, "active");
  assert.equal(rows.credCreated.isActive, true);
});

test("completeEmbeddedSignup sin coexistencia no llama smb_app_data", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.accessToken = "";
  const requested = mockGraphSignupFetch({ onBizApp: false });
  stubFreshIntegration();

  const result = await completeEmbeddedSignup({
    ownerUserId: "owner-1",
    code: "AUTH_CODE",
    wabaId: "waba_1",
    event: "FINISH",
    ensureFollowupDefault: async () => ({ created: true }),
  });

  assert.equal(result.coexistenceEnabled, false);
  assert.equal(requested.some((row) => row.url.includes("/smb_app_data")), false);
});

test("completeEmbeddedSignup resuelve si debug_token falla", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.accessToken = "";
  const requested = mockGraphSignupFetch({ debugStatus: 400, onBizApp: false });
  const rows = stubFreshIntegration();

  const result = await completeEmbeddedSignup({
    ownerUserId: "owner-1",
    code: "AUTH_CODE",
    wabaId: "waba_1",
    event: "FINISH",
    ensureFollowupDefault: async () => ({ created: true }),
  });

  assert.equal(requested.some((row) => row.url.includes("debug_token")), true);
  assert.equal(result.provider, "meta");
  assert.equal(rows.created.status, "active");
  assert.equal(rows.credCreated.isActive, true);
});

test("disconnectMetaWhatsapp desactiva integración y credenciales", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";

  const integration = {
    id: "int_meta",
    ownerUserId: "owner-1",
    wabaId: "waba_1",
    status: "active",
    coexistenceEnabled: true,
    update: async (patch) => Object.assign(integration, patch),
  };
  ChannelIntegration.findOne = async () => integration;
  ChannelCredential.findOne = async () => ({
    cipherText: encryptCredentialsPayload({ accessToken: "EAA_TOKEN" }),
  });
  let credPatch;
  ChannelCredential.update = async (patch) => {
    credPatch = patch;
    return [1];
  };

  const unsubCalls = [];
  global.fetch = async (url, opts) => {
    unsubCalls.push({ url: String(url), method: opts?.method });
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
  };

  const result = await disconnectMetaWhatsapp({ ownerUserId: "owner-1" });
  assert.equal(result.ok, true);
  assert.equal(result.integrationId, "int_meta");
  assert.equal(integration.status, "disabled");
  assert.equal(integration.coexistenceEnabled, false);
  assert.equal(credPatch.isActive, false);
  assert.equal(unsubCalls.length, 1);
  assert.equal(unsubCalls[0].method, "DELETE");
  assert.match(unsubCalls[0].url, /waba_1\/subscribed_apps/);
});
