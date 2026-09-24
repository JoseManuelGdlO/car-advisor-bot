import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "./errors.js";
import {
  assertTextOnlyTemplateBody,
  buildTextOnlyBodyComponents,
  bodyTextFromComponents,
  generateFollowupTemplateName,
} from "./whatsappTemplateBody.js";

test("assertTextOnlyTemplateBody rechaza vacío", () => {
  assert.throws(() => assertTextOnlyTemplateBody("  "), (err) => err instanceof ApiError && err.status === 400);
});

test("assertTextOnlyTemplateBody rechaza variables", () => {
  assert.throws(
    () => assertTextOnlyTemplateBody("Hola {{1}}, ¿sigues interesado?"),
    (err) => err instanceof ApiError && /solo texto/i.test(err.message)
  );
});

test("assertTextOnlyTemplateBody recorta y acepta texto plano", () => {
  assert.equal(assertTextOnlyTemplateBody("  Hola, ¿sigues ahí?  "), "Hola, ¿sigues ahí?");
});

test("assertTextOnlyTemplateBody rechaza más de 1024 caracteres", () => {
  assert.throws(() => assertTextOnlyTemplateBody("x".repeat(1025)), ApiError);
});

test("buildTextOnlyBodyComponents no incluye example", () => {
  const components = buildTextOnlyBodyComponents("Hola");
  assert.deepEqual(components, [{ type: "BODY", text: "Hola" }]);
  assert.equal(bodyTextFromComponents(components), "Hola");
});

test("generateFollowupTemplateName usa prefijo cab_sg_", () => {
  const name = generateFollowupTemplateName();
  assert.match(name, /^cab_sg_[a-f0-9]{8}$/);
});
