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

test("completeEmbeddedSignup 400 si falta wabaId y no intercambia el código", async () => {
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
    return { ok: true, status: 200, text: async () => "{}" };
  };

  await assert.rejects(
    () => completeEmbeddedSignup({ ownerUserId: "owner-1", code: "AUTH_CODE" }),
    (err) =>
      err instanceof ApiError &&
      err.status === 400 &&
      err.message === "Meta no devolvió el WABA ID. Completa de nuevo el flujo."
  );
  assert.equal(exchangeCalled, false);
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

function mockGraphSignupFetch() {
  global.fetch = async (url) => {
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
            data: [{ id: "pn_1", display_phone_number: "+52 1", is_on_biz_app: true, platform_type: "CLOUD_API" }],
          }),
      };
    }
    if (u.includes("/pn_1")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ id: "pn_1", display_phone_number: "+52 1", is_on_biz_app: true, platform_type: "CLOUD_API" }),
      };
    }
    return { ok: true, status: 200, text: async () => "{}" };
  };
}

test("completeEmbeddedSignup resuelve si ensureFollowupDefault lanza y no revierte credenciales", async () => {
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
  assert.equal(created.status, "active");
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
