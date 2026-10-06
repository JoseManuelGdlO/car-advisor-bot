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

test("GET con ticket válido redirige a la URL fija y guarda el ticket en cookie", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "super-secret-value";
  const res = mockRes();
  await getWhatsappSignupPage(
    { query: { ticket: " ticket-1 " }, headers: { "x-forwarded-proto": "https" } },
    res,
    throwNext,
    {
      previewSignupTicket: async (ticket) => (ticket === "ticket-1" ? { ok: true } : null),
      publicMetaSignupConfig,
    },
  );
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, "/whatsapp-signup");
  assert.match(res.headers["Set-Cookie"], /meta_signup_ticket=ticket-1/);
  assert.match(res.headers["Set-Cookie"], /HttpOnly/);
  assert.match(res.headers["Set-Cookie"], /SameSite=Lax/);
  assert.match(res.headers["Set-Cookie"], /Secure/);
  assert.equal(String(res.body).includes("connect.facebook.net"), false);
});

test("GET sin query usa la cookie y sirve la página de alta", async () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "super-secret-value";
  const res = mockRes();
  await getWhatsappSignupPage(
    { query: {}, headers: { cookie: "meta_signup_ticket=ticket-1" } },
    res,
    throwNext,
    {
      previewSignupTicket: async (ticket) => (ticket === "ticket-1" ? { ok: true } : null),
      publicMetaSignupConfig,
    },
  );
  assert.equal(res.statusCode, 200);
  assert.match(String(res.body), /cfg-id/);
  assert.equal(String(res.body).includes("super-secret-value"), false);
});

test("la página no cancela el ticket cuando Facebook aún no devuelve el código", () => {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  const html = renderSignupPageHtml({
    ticket: "ticket-1",
    config: publicMetaSignupConfig(),
  });
  assert.equal(html.includes('if (!code || eventName.toUpperCase() === "CANCEL")'), false);
  assert.match(html, /eventName\.toUpperCase\(\) === "CANCEL"/);
  assert.match(html, /if \(!code\)/);
});

test("GET con code de OAuth completa el ticket de la cookie y vuelve a la app", async () => {
  const res = mockRes();
  let completed;
  await getWhatsappSignupPage(
    { query: { code: " AUTH_CODE " }, headers: { cookie: "meta_signup_ticket=ticket-1" } },
    res,
    throwNext,
    {
      completeMetaSignupTicket: async (input) => {
        completed = input;
        return { ok: true, status: "completed", message: "WhatsApp conectado." };
      },
    },
  );
  assert.deepEqual(completed, { ticket: "ticket-1", code: "AUTH_CODE" });
  assert.equal(res.statusCode, 200);
  assert.match(String(res.body), /autobot:\/\/whatsapp-signup\?result=success/);
  assert.equal(String(res.body).includes("connect.facebook.net"), false);
  assert.equal(String(res.body).includes("AUTH_CODE"), false);
  assert.match(res.headers["Set-Cookie"], /meta_signup_ticket=/);
  assert.match(res.headers["Set-Cookie"], /Max-Age=0/);
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
