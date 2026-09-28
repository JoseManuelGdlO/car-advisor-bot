import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import { getMetaWhatsappWebhook } from "./whatsappCloudWebhookController.js";

const originalToken = env.meta.webhookVerifyToken;

const mockRes = () => {
  const res = {
    statusCode: null,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
      this.body = undefined;
      return this;
    },
  };
  return res;
};

test.afterEach(() => {
  env.meta.webhookVerifyToken = originalToken;
});

test("GET challenge devuelve hub.challenge cuando el token coincide", () => {
  env.meta.webhookVerifyToken = "verify-me";
  const req = {
    query: {
      "hub.mode": "subscribe",
      "hub.verify_token": "verify-me",
      "hub.challenge": "12345",
    },
  };
  const res = mockRes();
  getMetaWhatsappWebhook(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, "12345");
});

test("GET challenge responde 403 si el token no coincide", () => {
  env.meta.webhookVerifyToken = "verify-me";
  const req = {
    query: {
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong",
      "hub.challenge": "12345",
    },
  };
  const res = mockRes();
  getMetaWhatsappWebhook(req, res);
  assert.equal(res.statusCode, 403);
});

test("GET challenge responde 503 si el verify token no está configurado", () => {
  env.meta.webhookVerifyToken = "";
  const req = {
    query: {
      "hub.mode": "subscribe",
      "hub.verify_token": "anything",
      "hub.challenge": "12345",
    },
  };
  const res = mockRes();
  getMetaWhatsappWebhook(req, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body, "verify token not configured");
});
