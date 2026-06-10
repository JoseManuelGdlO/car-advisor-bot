import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { formatZodIssues } from "./zodErrors.js";

test("formatZodIssues: password too_small en español", () => {
  try {
    z.object({ password: z.string().min(6) }).parse({ password: "abcd" });
    assert.fail("expected parse to throw");
  } catch (e) {
    const { message, errors } = formatZodIssues(e.issues);
    assert.equal(errors.length, 1);
    assert.deepEqual(errors[0].path, ["password"]);
    assert.match(errors[0].message, /6/);
    assert.equal(message, errors[0].message);
  }
});

test("formatZodIssues: unrecognized_keys en español", () => {
  const schema = z.object({ name: z.string() }).strict();
  const parsed = schema.safeParse({ name: "Ana", extraField: "x" });
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  const { message, errors } = formatZodIssues(parsed.error.issues);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /no es válido/i);
  assert.equal(message, errors[0].message);
});

test("formatZodIssues: varios campos usa resumen", () => {
  try {
    z.object({
      email: z.string().email(),
      password: z.string().min(6),
    }).parse({ email: "x", password: "a" });
    assert.fail("expected parse to throw");
  } catch (e) {
    const { message, errors } = formatZodIssues(e.issues);
    assert.ok(errors.length >= 2);
    assert.equal(message, "Revisa los datos del formulario.");
  }
});
