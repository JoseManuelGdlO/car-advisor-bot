import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { sequelize } from "../config/database.js";
import { ClientLead, User } from "../models/index.js";
import {
  createSellerHandler,
  deleteSellerHandler,
  listSellersHandler,
  patchSellerHandler,
  patchSellerLeadScheduleHandler,
  restoreSellerHandler,
} from "./sellersController.js";
import { patchClientAssignment } from "./clientsController.js";
import { sellersRoutes } from "../routes/sellersRoutes.js";
import { clientsRoutes } from "../routes/clientsRoutes.js";
import { requireAdmin } from "../middlewares/auth.js";

const adminId = "550e8400-e29b-41d4-a716-446655440000";
const sellerId = "550e8400-e29b-41d4-a716-446655440001";
const otherSellerId = "550e8400-e29b-41d4-a716-446655440002";
const leadId = "550e8400-e29b-41d4-a716-446655440009";

const adminAuth = { type: "user", userId: adminId, email: "a@x.com", role: "admin", tenantOwnerUserId: adminId };
const sellerAuth = { type: "user", userId: sellerId, email: "s@x.com", role: "seller", tenantOwnerUserId: adminId };

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

const stubAll = (stubs) => {
  const originals = stubs.map(([obj, key]) => [obj, key, obj[key]]);
  for (const [obj, key, impl] of stubs) obj[key] = impl;
  return () => {
    for (const [obj, key, original] of originals) obj[key] = original;
  };
};

const call = async (handler, req) => {
  const res = createRes();
  let error;
  try {
    await handler(req, res, (e) => {
      error = e;
    });
  } catch (e) {
    error = e;
  }
  return { res, error };
};

const makeSellerRow = (overrides = {}) => {
  const row = {
    id: sellerId,
    name: "Sol",
    email: "sol@x.com",
    phone: null,
    active: true,
    role: "seller",
    tenantOwnerUserId: adminId,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
    async update(patch) {
      Object.assign(row, patch);
      return row;
    },
  };
  return row;
};

test("POST /sellers: crea vendedor del tenant sin calendario y con password hasheado", async () => {
  let created;
  const restore = stubAll([
    [User, "findOne", async () => null],
    [
      User,
      "create",
      async (data) => {
        created = data;
        return { ...data, id: sellerId, createdAt: new Date() };
      },
    ],
  ]);
  try {
    const { res, error } = await call(createSellerHandler, {
      auth: adminAuth,
      body: { name: "Sol", email: "sol@x.com", password: "secreto1" },
    });
    assert.equal(error, undefined);
    assert.equal(res.statusCode, 201);
    assert.equal(created.role, "seller");
    assert.equal(created.tenantOwnerUserId, adminId);
    assert.equal(created.calendarSchedulingUrl, null);
    assert.notEqual(created.passwordHash, "secreto1");
    assert.equal(await bcrypt.compare("secreto1", created.passwordHash), true);
    assert.equal(res.payload.email, "sol@x.com");
    assert.equal(res.payload.passwordHash, undefined);
  } finally {
    restore();
  }
});

test("POST /sellers: email duplicado (incluso de un vendedor inactivo) responde 409", async () => {
  const restore = stubAll([[User, "findOne", async () => makeSellerRow({ active: false })]]);
  try {
    const { error } = await call(createSellerHandler, {
      auth: adminAuth,
      body: { name: "Sol", email: "sol@x.com", password: "secreto1" },
    });
    assert.equal(error?.status, 409);
  } finally {
    restore();
  }
});

test("POST /sellers: un vendedor recibe 403 y datos inválidos 400", async () => {
  const forbidden = await call(createSellerHandler, {
    auth: sellerAuth,
    body: { name: "Sol", email: "sol@x.com", password: "secreto1" },
  });
  assert.equal(forbidden.error?.status, 403);
  const invalid = await call(createSellerHandler, { auth: adminAuth, body: { name: "S", email: "x", password: "1" } });
  assert.ok(invalid.error, "debe fallar validación");
});

test("GET /sellers: por defecto solo activos; includeInactive=1 incluye bajas", async () => {
  const wheres = [];
  const restore = stubAll([
    [
      User,
      "findAll",
      async (opts) => {
        wheres.push(opts.where);
        return [makeSellerRow()];
      },
    ],
    [ClientLead, "count", async () => 3],
  ]);
  try {
    const active = await call(listSellersHandler, { auth: adminAuth, query: {} });
    const all = await call(listSellersHandler, { auth: adminAuth, query: { includeInactive: "1" } });
    assert.equal(active.res.payload[0].assignedLeadsCount, 3);
    assert.equal(active.res.payload[0].autoAssignLeads, false);
    assert.deepEqual(active.res.payload[0].weeklySchedule, {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    });
    assert.equal(all.error, undefined);
  } finally {
    restore();
  }
  assert.deepEqual(wheres[0], { role: "seller", tenantOwnerUserId: adminId, active: true });
  assert.deepEqual(wheres[1], { role: "seller", tenantOwnerUserId: adminId });
});

test("DELETE /sellers/:id: baja lógica, desasigna leads y no destruye la fila", async () => {
  const seller = makeSellerRow();
  const tx = { id: "tx-deactivate" };
  let sellerTx;
  seller.update = async (patch, options) => {
    sellerTx = options?.transaction;
    Object.assign(seller, patch);
    return seller;
  };
  let leadUpdate;
  let destroyed = false;
  const originalTransaction = sequelize.transaction.bind(sequelize);
  sequelize.transaction = async (callback) => callback(tx);
  const restore = stubAll([
    [User, "findOne", async () => seller],
    [User, "destroy", async () => {
      destroyed = true;
    }],
    [
      ClientLead,
      "update",
      async (patch, opts) => {
        leadUpdate = { patch, where: opts.where, transaction: opts.transaction };
        return [4];
      },
    ],
  ]);
  try {
    const { res, error } = await call(deleteSellerHandler, { auth: adminAuth, params: { id: sellerId } });
    assert.equal(error, undefined);
    assert.equal(seller.active, false);
    assert.equal(destroyed, false);
    assert.deepEqual(leadUpdate.patch, { assignedSellerUserId: null });
    assert.deepEqual(leadUpdate.where, { ownerUserId: adminId, assignedSellerUserId: sellerId });
    assert.equal(sellerTx, tx);
    assert.equal(leadUpdate.transaction, tx);
    assert.equal(res.payload.unassignedLeads, 4);
    assert.equal(res.payload.ok, true);
  } finally {
    sequelize.transaction = originalTransaction;
    restore();
  }
});

test("DELETE /sellers/:id: ya inactivo => 409; de otro tenant/admin => 404", async () => {
  const lookups = [];
  const restore = stubAll([
    [
      User,
      "findOne",
      async (opts) => {
        lookups.push(opts.where);
        return opts.where.id === sellerId ? makeSellerRow({ active: false }) : null;
      },
    ],
  ]);
  try {
    const already = await call(deleteSellerHandler, { auth: adminAuth, params: { id: sellerId } });
    assert.equal(already.error?.status, 409);
    const missing = await call(deleteSellerHandler, { auth: adminAuth, params: { id: otherSellerId } });
    assert.equal(missing.error?.status, 404);
  } finally {
    restore();
  }
  assert.deepEqual(lookups[0], { id: sellerId, role: "seller", tenantOwnerUserId: adminId });
});

test("POST /sellers/:id/restore: reactiva sin reasignar leads", async () => {
  const seller = makeSellerRow({ active: false });
  let leadsTouched = false;
  const restore = stubAll([
    [User, "findOne", async () => seller],
    [ClientLead, "update", async () => {
      leadsTouched = true;
      return [0];
    }],
  ]);
  try {
    const { res, error } = await call(restoreSellerHandler, { auth: adminAuth, params: { id: sellerId } });
    assert.equal(error, undefined);
    assert.equal(seller.active, true);
    assert.equal(leadsTouched, false);
    assert.equal(res.payload.seller.active, true);
  } finally {
    restore();
  }
});

test("POST /sellers/:id/restore: vendedor ya activo => 409", async () => {
  const restore = stubAll([[User, "findOne", async () => makeSellerRow()]]);
  try {
    const { error } = await call(restoreSellerHandler, { auth: adminAuth, params: { id: sellerId } });
    assert.equal(error?.status, 409);
  } finally {
    restore();
  }
});

test("PATCH /sellers/:id: valida email único y actualiza campos", async () => {
  const seller = makeSellerRow();
  const restore = stubAll([
    [
      User,
      "findOne",
      async (opts) => {
        if (opts.where.id) return seller;
        // búsqueda por email: ocupado por otro usuario
        return makeSellerRow({ id: otherSellerId, email: opts.where.email });
      },
    ],
    [ClientLead, "count", async () => 0],
  ]);
  try {
    const conflict = await call(patchSellerHandler, {
      auth: adminAuth,
      params: { id: sellerId },
      body: { email: "otro@x.com" },
    });
    assert.equal(conflict.error?.status, 409);
    const ok = await call(patchSellerHandler, {
      auth: adminAuth,
      params: { id: sellerId },
      body: { name: "Sol Nueva", phone: "5512345678" },
    });
    assert.equal(ok.error, undefined);
    assert.equal(seller.name, "Sol Nueva");
    assert.equal(ok.res.payload.phone, "5512345678");
  } finally {
    restore();
  }
});

test("PATCH /clients/:id/assignment: admin asigna a vendedor activo del tenant", async () => {
  const lead = {
    id: leadId,
    ownerUserId: adminId,
    assignedSellerUserId: null,
    async update(patch) {
      Object.assign(lead, patch);
    },
  };
  const lookups = [];
  const restore = stubAll([
    [
      ClientLead,
      "findOne",
      async (opts) => {
        lookups.push(opts.where);
        return lead;
      },
    ],
    [User, "findOne", async () => makeSellerRow()],
  ]);
  try {
    const { res, error } = await call(patchClientAssignment, {
      auth: adminAuth,
      params: { id: leadId },
      body: { assignedSellerUserId: sellerId },
    });
    assert.equal(error, undefined);
    assert.equal(lead.assignedSellerUserId, sellerId);
    assert.equal(res.payload.assignedSellerUserId, sellerId);
    assert.equal(lookups[0].ownerUserId, adminId);
  } finally {
    restore();
  }
});

test("PATCH /clients/:id/assignment: null desasigna", async () => {
  const lead = {
    id: leadId,
    assignedSellerUserId: sellerId,
    async update(patch) {
      Object.assign(lead, patch);
    },
  };
  const restore = stubAll([[ClientLead, "findOne", async () => lead]]);
  try {
    const { error } = await call(patchClientAssignment, {
      auth: adminAuth,
      params: { id: leadId },
      body: { assignedSellerUserId: null },
    });
    assert.equal(error, undefined);
    assert.equal(lead.assignedSellerUserId, null);
  } finally {
    restore();
  }
});

test("PATCH /clients/:id/assignment: rechaza vendedor inactivo (400), inexistente (404) y rol seller (403)", async () => {
  const lead = { id: leadId, async update() {} };
  const restore = stubAll([
    [ClientLead, "findOne", async () => lead],
    [
      User,
      "findOne",
      async (opts) => {
        if (opts.where.id === sellerId) return makeSellerRow({ active: false });
        return null;
      },
    ],
  ]);
  try {
    const inactive = await call(patchClientAssignment, {
      auth: adminAuth,
      params: { id: leadId },
      body: { assignedSellerUserId: sellerId },
    });
    assert.equal(inactive.error?.status, 400);
    const missing = await call(patchClientAssignment, {
      auth: adminAuth,
      params: { id: leadId },
      body: { assignedSellerUserId: otherSellerId },
    });
    assert.equal(missing.error?.status, 404);
    const forbidden = await call(patchClientAssignment, {
      auth: sellerAuth,
      params: { id: leadId },
      body: { assignedSellerUserId: sellerId },
    });
    assert.equal(forbidden.error?.status, 403);
  } finally {
    restore();
  }
});

test("PATCH /sellers/:id/lead-schedule: guarda interruptor y horario semanal", async () => {
  const seller = makeSellerRow();
  const restore = stubAll([
    [User, "findOne", async () => seller],
    [ClientLead, "count", async () => 1],
  ]);
  try {
    const { res, error } = await call(patchSellerLeadScheduleHandler, {
      auth: adminAuth,
      params: { id: sellerId },
      body: {
        autoAssignLeads: true,
        weeklySchedule: {
          monday: [{ start: "09:00", end: "18:00" }],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: [],
        },
      },
    });
    assert.equal(error, undefined);
    assert.equal(seller.autoAssignLeads, true);
    assert.deepEqual(seller.weeklySchedule.monday, [{ start: "09:00", end: "18:00" }]);
    assert.equal(res.payload.autoAssignLeads, true);
    assert.deepEqual(res.payload.weeklySchedule.monday, [{ start: "09:00", end: "18:00" }]);
  } finally {
    restore();
  }
});

test("PATCH /sellers/:id/lead-schedule: horario inválido 400; vendedor 403", async () => {
  const seller = makeSellerRow();
  const restore = stubAll([[User, "findOne", async () => seller]]);
  try {
    const invalid = await call(patchSellerLeadScheduleHandler, {
      auth: adminAuth,
      params: { id: sellerId },
      body: { weeklySchedule: { monday: [{ start: "18:00", end: "09:00" }] } },
    });
    assert.equal(invalid.error?.status, 400);
    const forbidden = await call(patchSellerLeadScheduleHandler, {
      auth: sellerAuth,
      params: { id: sellerId },
      body: { autoAssignLeads: true },
    });
    assert.equal(forbidden.error?.status, 403);
  } finally {
    restore();
  }
});

test("rutas /sellers y /clients/:id/assignment exigen admin", () => {
  const find = (router, method, path) => {
    const layer = router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
    assert.ok(layer, `ruta ${method} ${path} no encontrada`);
    return layer.route.stack.map((l) => l.handle);
  };
  const checks = [
    [sellersRoutes, "get", "/sellers"],
    [sellersRoutes, "post", "/sellers"],
    [sellersRoutes, "get", "/sellers/:id"],
    [sellersRoutes, "patch", "/sellers/:id"],
    [sellersRoutes, "delete", "/sellers/:id"],
    [sellersRoutes, "post", "/sellers/:id/restore"],
    [sellersRoutes, "patch", "/sellers/:id/lead-schedule"],
    [clientsRoutes, "patch", "/clients/:id/assignment"],
  ];
  for (const [router, method, path] of checks) {
    assert.ok(find(router, method, path).includes(requireAdmin), `${method} ${path} sin requireAdmin`);
  }
});
