import test from "node:test";
import assert from "node:assert/strict";
import { sendMessageSchema, setControlSchema } from "./conversationsController.js";

test("sendMessageSchema acepta payload valido", () => {
  const payload = sendMessageSchema.parse({ text: "Hola cliente" });
  assert.equal(payload.text, "Hola cliente");
});

test("sendMessageSchema rechaza texto vacio", () => {
  assert.throws(() => sendMessageSchema.parse({ text: "" }));
});

test("setControlSchema valida bandera de control humano", () => {
  const payload = setControlSchema.parse({ isHumanControlled: true });
  assert.equal(payload.isHumanControlled, true);
});
