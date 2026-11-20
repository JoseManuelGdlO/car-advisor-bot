import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { User } from "../models/index.js";
import { hashPassword } from "../utils/auth.js";
import { login, register } from "./authController.js";

const adminId = "550e8400-e29b-41d4-a716-446655440000";
const sellerId = "550e8400-e29b-41d4-a716-446655440001";

const createRes = () => ({
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(value) {
    this.payload = value;
    return value;
  },
});

const stub = (obj, key, impl) => {
  const original = obj[key];
  obj[key] = impl;
  return () => {
    obj[key] = original;
  };
};

test("register crea siempre un usuario admin sin tenantOwner", async () => {
  let created;
  const restoreFind = stub(User, "findOne", async () => null);
  const restoreCreate = stub(User, "create", async (data) => {
    created = data;
    return { id: adminId, email: data.email, name: data.name, role: data.role };
  });
  try {
    const res = createRes();
    let err;
    await register(
      { body: { email: "a@x.com", password: "secreto1", name: "Ana", role: "seller", tenantOwnerUserId: sellerId } },
      res,
      (e) => {
        err = e;
      }
    );
    assert.equal(err, undefined);
    assert.equal(created.role, "admin");
    assert.equal(created.tenantOwnerUserId, null);
    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.role, "admin");
  } finally {
    restoreFind();
    restoreCreate();
  }
});

test("login de seller devuelve role/tenantOwnerUserId en respuesta y JWT", async () => {
  const passwordHash = await hashPassword("secreto1");
  const restore = stub(User, "findOne", async () => ({
    id: sellerId,
    email: "s@x.com",
    name: "Sol",
    passwordHash,
    active: true,
    role: "seller",
    tenantOwnerUserId: adminId,
  }));
  try {
    const res = createRes();
    let err;
    await login({ body: { email: "s@x.com", password: "secreto1" } }, res, (e) => {
      err = e;
    });
    assert.equal(err, undefined);
    assert.equal(res.payload.user.role, "seller");
    assert.equal(res.payload.user.tenantOwnerUserId, adminId);
    const decoded = jwt.decode(res.payload.token);
    assert.equal(decoded.sub, sellerId);
    assert.equal(decoded.role, "seller");
    assert.equal(decoded.tenantOwnerUserId, adminId);
  } finally {
    restore();
  }
});

test("login rechaza vendedor dado de baja", async () => {
  const passwordHash = await hashPassword("secreto1");
  const restore = stub(User, "findOne", async () => ({
    id: sellerId,
    email: "s@x.com",
    name: "Sol",
    passwordHash,
    active: false,
    role: "seller",
    tenantOwnerUserId: adminId,
  }));
  try {
    let err;
    await login({ body: { email: "s@x.com", password: "secreto1" } }, createRes(), (e) => {
      err = e;
    });
    assert.equal(err?.status, 401);
  } finally {
    restore();
  }
});
