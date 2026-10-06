import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import { requireUserAuth } from "../middlewares/auth.js";
import { accountRoutes } from "../routes/accountRoutes.js";
import { publicMetaSignupConfig } from "../services/metaSignupService.js";
import {
  getWhatsappSignupPage,
  renderSignupErrorHtml,
  renderSignupPageHtml,
} from "./metaSignupPageController.js";

const originalMeta = { ...env.meta };

const throwNext = (err) => {
  if (err) throw err;
};

const mockRes = () => ({
  statusCode: 200,
  body: undefined,
  headers: {},
  setHeader(name, value) {
    this.headers[name] = value;
    return this;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  send(payload) {
    this.body = payload;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

test.afterEach(() => {
  Object.assign(env.meta, originalMeta);
});

test("renderSignupPageHtml incluye el SDK y el configId, no el secret", () => {
  env.meta.appId = "1414695997519169";
  env.meta.configId = "1085055910915460";
  env.meta.appSecret = "super-secret-value";
  env.meta.graphApiVersion = "v21.0";
  const html = renderSignupPageHtml({
    ticket: "ticket-1",
    config: publicMetaSignupConfig(),
  });
  assert.match(html, /https:\/\/connect\.facebook\.net\/es_LA\/sdk\.js/);
  assert.match(html, /1085055910915460/);
  assert.match(html, /Continuar con Facebook/);
  assert.match(html, /whatsapp_business_app_onboarding/);
  assert.match(html, /autobot:\/\/whatsapp-signup\?result=/);
  assert.equal(html.includes("super-secret-value"), false);
});

test("renderSignupErrorHtml no carga el SDK de Facebook", () => {
  const html = renderSignupErrorHtml("Este enlace de conexión no es válido o ya venció.");
  assert.match(html, /no es válido o ya venció/);
  assert.equal(html.includes("connect.facebook.net"), false);
  assert.equal(html.includes("fbAsyncInit"), false);
});

test("GET sin ticket válido responde 400, CSP y COOP, sin SDK", async () => {
  const res = mockRes();
  await getWhatsappSignupPage({ query: {} }, res, throwNext, {
    previewSignupTicket: async () => null,
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.headers["Cross-Origin-Opener-Policy"], "unsafe-none");
  assert.match(res.headers["Content-Security-Policy"], /https:\/\/connect\.facebook\.net/);
  assert.equal(String(res.body).includes("connect.facebook.net"), false);
});

test("GET con ticket válido sirve la página de alta", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "super-secret-value";
  const res = mockRes();
  await getWhatsappSignupPage({ query: { ticket: " ticket-1 " } }, res, throwNext, {
    previewSignupTicket: async (ticket) => (ticket === "ticket-1" ? { ok: true } : null),
    publicMetaSignupConfig,
  });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.body), /cfg-id/);
  assert.equal(String(res.body).includes("super-secret-value"), false);
});

test("las rutas autenticadas del ticket exigen sesión", () => {
  const paths = [
    ["post", "/integrations/whatsapp/meta/signup-ticket"],
    ["get", "/integrations/whatsapp/meta/signup-ticket"],
  ];
  for (const [method, path] of paths) {
    const layer = accountRoutes.stack.find(
      (entry) => entry.route && entry.route.path === path && entry.route.methods[method],
    );
    assert.ok(layer, `${method} ${path}`);
    assert.equal(
      layer.route.stack.some((entry) => entry.handle === requireUserAuth),
      true,
    );
  }
});
