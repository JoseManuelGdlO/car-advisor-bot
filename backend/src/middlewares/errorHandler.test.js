import test from "node:test";
import assert from "node:assert/strict";
import { ZodError, z } from "zod";
import { errorHandler } from "./errorHandler.js";
import { ApiError } from "../utils/errors.js";

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("errorHandler incluye meta de Graph en el JSON", () => {
  const err = new ApiError(400, "La solicitud a Meta fue rechazada. Revisa la configuración de la app.");
  err.meta = {
    httpStatus: 400,
    code: 100,
    subcode: 33,
    type: "OAuthException",
    title: "Unsupported post request",
    message: "(#100) Invalid parameter",
    details: "Object with ID does not exist",
    fbtraceId: "AbC123",
    href: "https://developers.facebook.com/docs/graph-api/using-graph-api/error-handling/",
  };
  const res = mockRes();
  errorHandler(err, {}, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, err.message);
  assert.deepEqual(res.body.meta, err.meta);
});

test("errorHandler no agrega meta si el error no lo trae", () => {
  const err = new ApiError(404, "No encontrado");
  const res = mockRes();
  errorHandler(err, {}, res, () => {});
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "No encontrado");
  assert.equal("meta" in res.body, false);
});

test("errorHandler formatea ZodError", () => {
  let parsed;
  try {
    z.object({ to: z.string().min(1) }).parse({ to: "" });
  } catch (error) {
    parsed = error;
  }
  assert.equal(parsed instanceof ZodError, true);
  const res = mockRes();
  errorHandler(parsed, {}, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.ok(Array.isArray(res.body.errors));
});
