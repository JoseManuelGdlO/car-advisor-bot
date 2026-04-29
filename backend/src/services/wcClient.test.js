import test from "node:test";
import assert from "node:assert/strict";
import { wcClient } from "./wcClient.js";
import { env } from "../config/env.js";

const originalFetch = global.fetch;
const originalApiUrl = env.wc.apiUrl;
const originalServiceJwt = env.wc.serviceJwt;
const originalConsoleError = console.error;

test.afterEach(() => {
  global.fetch = originalFetch;
  env.wc.apiUrl = originalApiUrl;
  env.wc.serviceJwt = originalServiceJwt;
  console.error = originalConsoleError;
});

test("wcClient envía Authorization Bearer WC_SERVICE_JWT", async () => {
  env.wc.apiUrl = "https://wc.example";
  env.wc.serviceJwt = "svc-jwt-token";

  let requestHeaders;
  global.fetch = async (_url, options) => {
    requestHeaders = options?.headers || {};
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: "ONLINE", updatedAt: "2026-04-28T00:00:00.000Z" }),
    };
  };

  await wcClient.getDeviceStatus({ deviceId: "dev-1" });

  assert.equal(requestHeaders.Authorization, "Bearer svc-jwt-token");
  assert.equal(requestHeaders["x-api-key"], undefined);
  assert.equal(requestHeaders["Content-Type"], "application/json");
});

test("wcClient loggea service_jwt_invalid_or_missing_scope en 401 y no reintenta ciegamente", async () => {
  env.wc.apiUrl = "https://wc.example";
  env.wc.serviceJwt = "svc-jwt-token";

  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    return {
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: "unauthorized" }),
    };
  };

  const errorLogs = [];
  console.error = (...args) => {
    errorLogs.push(args);
  };

  await assert.rejects(
    () =>
      wcClient.sendMessageWithRetry({
        deviceId: "dev-1",
        to: "5215512345678",
        type: "text",
        text: "hola",
      }),
    (err) => err?.status === 401 && err?.message === "service_jwt_invalid_or_missing_scope"
  );

  assert.equal(callCount, 1);
  assert.ok(errorLogs.some((args) => String(args[0] || "").includes("service_jwt_invalid_or_missing_scope")));
});

test("wcClient sendMessage mantiene payload de texto legacy", async () => {
  env.wc.apiUrl = "https://wc.example";
  env.wc.serviceJwt = "svc-jwt-token";

  let requestBody;
  let requestHeaders;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(String(options?.body || "{}"));
    requestHeaders = options?.headers || {};
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    };
  };

  await wcClient.sendMessage({
    deviceId: "dev-1",
    to: "5215512345678",
    text: "Hola, soy el bot",
    tenantId: "tenant-1",
  });

  assert.deepEqual(requestBody, {
    to: "5215512345678",
    type: "text",
    text: "Hola, soy el bot",
    tenantId: "tenant-1",
  });
  assert.equal(requestHeaders["x-tenant-id"], "tenant-1");
});

test("wcClient sendMessage soporta payload de imagen", async () => {
  env.wc.apiUrl = "https://wc.example";
  env.wc.serviceJwt = "svc-jwt-token";

  let requestBody;
  let requestHeaders;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(String(options?.body || "{}"));
    requestHeaders = options?.headers || {};
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    };
  };

  await wcClient.sendMessage({
    deviceId: "dev-1",
    to: "5215512345678",
    type: "image",
    imageUrl: "https://example.com/car.png",
    caption: "Imagen del vehiculo",
    tenantId: "tenant-1",
  });

  assert.deepEqual(requestBody, {
    to: "5215512345678",
    type: "image",
    imageUrl: "https://example.com/car.png",
    caption: "Imagen del vehiculo",
    tenantId: "tenant-1",
  });
  assert.equal(requestHeaders["x-tenant-id"], "tenant-1");
});

test("wcClient sendMessage valida imageUrl cuando type=image", async () => {
  env.wc.apiUrl = "https://wc.example";
  env.wc.serviceJwt = "svc-jwt-token";

  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    };
  };

  await assert.rejects(
    () =>
      wcClient.sendMessage({
        deviceId: "dev-1",
        to: "5215512345678",
        type: "image",
      }),
    (err) => err?.status === 400 && err?.message === "imageUrl is required when type=image"
  );

  assert.equal(callCount, 0);
});
