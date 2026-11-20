import test from "node:test";
import assert from "node:assert/strict";
import {
  assertAdmin,
  buildUserAuth,
  isAdminAuth,
  isSellerAuth,
  leadVisibilityWhere,
  resolveTenantOwnerId,
  toUserSessionDto,
} from "./tenantAccess.js";

const adminId = "550e8400-e29b-41d4-a716-446655440000";
const sellerId = "550e8400-e29b-41d4-a716-446655440001";

test("buildUserAuth: admin usa su propio id como tenant", () => {
  const auth = buildUserAuth({ id: adminId, email: "a@x.com", role: "admin", tenantOwnerUserId: null });
  assert.deepEqual(auth, {
    type: "user",
    userId: adminId,
    email: "a@x.com",
    role: "admin",
    tenantOwnerUserId: adminId,
  });
});

test("buildUserAuth: usuario legacy sin role se trata como admin", () => {
  const auth = buildUserAuth({ id: adminId, email: "a@x.com" });
  assert.equal(auth.role, "admin");
  assert.equal(auth.tenantOwnerUserId, adminId);
});

test("buildUserAuth: seller usa tenantOwnerUserId de la columna", () => {
  const auth = buildUserAuth({ id: sellerId, email: "s@x.com", role: "seller", tenantOwnerUserId: adminId });
  assert.equal(auth.userId, sellerId);
  assert.equal(auth.role, "seller");
  assert.equal(auth.tenantOwnerUserId, adminId);
});

test("buildUserAuth: seller sin tenant es inválido (401)", () => {
  assert.throws(
    () => buildUserAuth({ id: sellerId, email: "s@x.com", role: "seller", tenantOwnerUserId: null }),
    (err) => err.status === 401
  );
});

test("resolveTenantOwnerId nunca devuelve el id del vendedor", () => {
  const req = { auth: buildUserAuth({ id: sellerId, email: "s@x.com", role: "seller", tenantOwnerUserId: adminId }) };
  assert.equal(resolveTenantOwnerId(req), adminId);
  const adminReq = { auth: buildUserAuth({ id: adminId, email: "a@x.com", role: "admin" }) };
  assert.equal(resolveTenantOwnerId(adminReq), adminId);
});

test("resolveTenantOwnerId soporta service token de tenant y rechaza platform", () => {
  assert.equal(resolveTenantOwnerId({ auth: { type: "service", scope: "tenant", userId: adminId } }), adminId);
  assert.throws(
    () => resolveTenantOwnerId({ auth: { type: "service", scope: "platform", userId: null } }),
    (err) => err.status === 401
  );
});

test("leadVisibilityWhere: admin ve todo el tenant", () => {
  const auth = buildUserAuth({ id: adminId, email: "a@x.com", role: "admin" });
  assert.deepEqual(leadVisibilityWhere(auth), { ownerUserId: adminId });
});

test("leadVisibilityWhere: seller solo ve leads asignados a él", () => {
  const auth = buildUserAuth({ id: sellerId, email: "s@x.com", role: "seller", tenantOwnerUserId: adminId });
  assert.deepEqual(leadVisibilityWhere(auth), { ownerUserId: adminId, assignedSellerUserId: sellerId });
});

test("isAdminAuth / isSellerAuth / assertAdmin", () => {
  const admin = buildUserAuth({ id: adminId, email: "a@x.com", role: "admin" });
  const seller = buildUserAuth({ id: sellerId, email: "s@x.com", role: "seller", tenantOwnerUserId: adminId });
  assert.equal(isAdminAuth(admin), true);
  assert.equal(isSellerAuth(admin), false);
  assert.equal(isSellerAuth(seller), true);
  assert.equal(isAdminAuth(seller), false);
  assert.doesNotThrow(() => assertAdmin(admin));
  assert.throws(() => assertAdmin(seller), (err) => err.status === 403);
  assert.throws(() => assertAdmin({ type: "service", scope: "tenant" }), (err) => err.status === 403);
});

test("toUserSessionDto expone role y tenantOwnerUserId", () => {
  const dto = toUserSessionDto({ id: sellerId, email: "s@x.com", name: "Sol", role: "seller", tenantOwnerUserId: adminId });
  assert.deepEqual(dto, { id: sellerId, email: "s@x.com", name: "Sol", role: "seller", tenantOwnerUserId: adminId });
});
