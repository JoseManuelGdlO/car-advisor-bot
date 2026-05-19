import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import { resolveRequestOwner } from "./resolveRequestOwner.js";

const ownerA = "550e8400-e29b-41d4-a716-446655440000";
const ownerB = "550e8400-e29b-41d4-a716-446655440001";

test("resolveRequestOwner returns userId for JWT user auth", () => {
  const req = { auth: { type: "user", userId: ownerA }, body: {}, query: {} };
  assert.equal(resolveRequestOwner(req, { queryField: "ownerUserId" }), ownerA);
});

test("resolveRequestOwner uses token owner for tenant service without explicit owner", () => {
  const req = {
    auth: { type: "service", scope: "tenant", userId: ownerA },
    body: {},
    query: {},
  };
  assert.equal(resolveRequestOwner(req, { bodyField: "owner_user_id" }), ownerA);
});

test("resolveRequestOwner rejects tenant service explicit owner mismatch", () => {
  const req = {
    auth: { type: "service", scope: "tenant", userId: ownerA },
    body: { owner_user_id: ownerB },
    query: {},
  };
  assert.throws(
    () => resolveRequestOwner(req, { bodyField: "owner_user_id" }),
    (err) => err.status === 403
  );
});

test("resolveRequestOwner accepts matching explicit owner for tenant service", () => {
  const req = {
    auth: { type: "service", scope: "tenant", userId: ownerA },
    body: { owner_user_id: ownerA },
    query: {},
  };
  assert.equal(resolveRequestOwner(req, { bodyField: "owner_user_id" }), ownerA);
});

test("resolveRequestOwner requires owner for platform service", () => {
  const previousNodeEnv = env.nodeEnv;
  const previousDefault = env.bot.defaultOwnerUserId;
  env.nodeEnv = "production";
  env.bot.defaultOwnerUserId = "";
  try {
    const req = {
      auth: { type: "service", scope: "platform", userId: null },
      body: {},
      query: {},
    };
    assert.throws(
      () => resolveRequestOwner(req, { queryField: "ownerUserId" }),
      (err) => err.status === 400
    );
  } finally {
    env.nodeEnv = previousNodeEnv;
    env.bot.defaultOwnerUserId = previousDefault;
  }
});

test("resolveRequestOwner accepts query owner for platform service", () => {
  const req = {
    auth: { type: "service", scope: "platform", userId: null },
    body: {},
    query: { ownerUserId: ownerB },
  };
  assert.equal(resolveRequestOwner(req, { queryField: "ownerUserId" }), ownerB);
});
