import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../models/index.js";
import { signUserJwt } from "../utils/auth.js";
import { requireAdmin, requireAdminOrService, requireUserAuth } from "./auth.js";

const adminId = "550e8400-e29b-41d4-a716-446655440000";
const sellerId = "550e8400-e29b-41d4-a716-446655440001";

const run = async (mw, req) => {
  let err;
  await mw(req, {}, (e) => {
    err = e;
  });
  return err;
};

const withUser = async (row, fn) => {
  const original = User.findByPk;
  User.findByPk = async () => row;
  try {
    return await fn();
  } finally {
    User.findByPk = original;
  }
};

test("requireUserAuth enriquece req.auth para admin", async () => {
  const token = signUserJwt({ sub: adminId, type: "user" });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const err = await withUser(
    { id: adminId, email: "a@x.com", active: true, role: "admin", tenantOwnerUserId: null },
    () => run(requireUserAuth, req)
  );
  assert.equal(err, undefined);
  assert.deepEqual(req.auth, {
    type: "user",
    userId: adminId,
    email: "a@x.com",
    role: "admin",
    tenantOwnerUserId: adminId,
  });
});

test("requireUserAuth enriquece req.auth para seller con tenant del admin", async () => {
  const token = signUserJwt({ sub: sellerId, type: "user" });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const err = await withUser(
    { id: sellerId, email: "s@x.com", active: true, role: "seller", tenantOwnerUserId: adminId },
    () => run(requireUserAuth, req)
  );
  assert.equal(err, undefined);
  assert.equal(req.auth.role, "seller");
  assert.equal(req.auth.userId, sellerId);
  assert.equal(req.auth.tenantOwnerUserId, adminId);
});

test("requireUserAuth rechaza vendedor dado de baja", async () => {
  const token = signUserJwt({ sub: sellerId, type: "user" });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const err = await withUser(
    { id: sellerId, email: "s@x.com", active: false, role: "seller", tenantOwnerUserId: adminId },
    () => run(requireUserAuth, req)
  );
  assert.equal(err?.status, 401);
  assert.equal(req.auth, undefined);
});

test("requireAdmin deja pasar admin y bloquea seller con 403", async () => {
  const ok = await run(requireAdmin, { auth: { type: "user", userId: adminId, role: "admin", tenantOwnerUserId: adminId } });
  assert.equal(ok, undefined);
  const denied = await run(requireAdmin, {
    auth: { type: "user", userId: sellerId, role: "seller", tenantOwnerUserId: adminId },
  });
  assert.equal(denied?.status, 403);
});

test("requireAdminOrService permite service token y bloquea seller", async () => {
  assert.equal(await run(requireAdminOrService, { auth: { type: "service", scope: "tenant", userId: adminId } }), undefined);
  assert.equal(
    (await run(requireAdminOrService, { auth: { type: "user", userId: sellerId, role: "seller", tenantOwnerUserId: adminId } }))
      ?.status,
    403
  );
});
