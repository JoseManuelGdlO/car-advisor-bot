import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../utils/errors.js";
import { sendConversationAttachment, sendMessageSchema, setControlSchema } from "./conversationsController.js";

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

test("sendConversationAttachment falla cuando falta archivo adjunto", async () => {
  const req = {
    auth: { userId: "550e8400-e29b-41d4-a716-446655440000" },
    body: { caption: "Imagen del vehiculo" },
    params: { id: "1" },
  };
  const res = {
    status() {
      throw new Error("No debe responder cuando falta archivo");
    },
    json() {
      throw new Error("No debe responder cuando falta archivo");
    },
  };

  await assert.rejects(
    () => sendConversationAttachment(req, res),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.status, 400);
      assert.equal(error.message, "attachment file is required");
      return true;
    }
  );
});
