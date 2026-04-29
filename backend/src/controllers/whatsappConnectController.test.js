import test from "node:test";
import assert from "node:assert/strict";
import { sendTestSchema } from "./whatsappConnectController.js";

test("sendTestSchema mantiene compatibilidad con payload de texto", () => {
  const payload = sendTestSchema.parse({
    integrationId: "550e8400-e29b-41d4-a716-446655440000",
    to: "5215512345678",
    text: "Hola, soy el bot",
  });
  assert.equal(payload.type, undefined);
  assert.equal(payload.text, "Hola, soy el bot");
});

test("sendTestSchema acepta payload de imagen valido", () => {
  const payload = sendTestSchema.parse({
    integrationId: "550e8400-e29b-41d4-a716-446655440000",
    to: "5215512345678",
    type: "image",
    imageUrl: "https://example.com/car.png",
    caption: "Imagen del vehiculo",
  });
  assert.equal(payload.type, "image");
  assert.equal(payload.imageUrl, "https://example.com/car.png");
});

test("sendTestSchema rechaza imagen sin imageUrl", () => {
  assert.throws(
    () =>
      sendTestSchema.parse({
        integrationId: "550e8400-e29b-41d4-a716-446655440000",
        to: "5215512345678",
        type: "image",
      }),
    /imageUrl/
  );
});
