import test from "node:test";
import assert from "node:assert/strict";
import {
  BotSetting,
  BusinessProfile,
  ClientLead,
  Conversation,
  FinancingPlan,
  Message,
  User,
  Vehicle,
} from "../models/index.js";
import { createClient, getClient, listClients, patchClient } from "./clientsController.js";
import { getConversationMessages, listConversations } from "./conversationsController.js";
import { createVehicle } from "./vehiclesController.js";
import { createFinancingPlan } from "./financingController.js";
import { getAccountProfile, patchAccountProfile, deleteAccount } from "./accountController.js";
import { accountRoutes } from "../routes/accountRoutes.js";
import { faqRoutes } from "../routes/faqRoutes.js";
import { blacklistRoutes } from "../routes/blacklistRoutes.js";
import { botSettingsRoutes } from "../routes/botSettingsRoutes.js";
import { authRoutes } from "../routes/authRoutes.js";
import { botConversationRoutes } from "../routes/botConversationRoutes.js";
import { vehiclesRoutes } from "../routes/vehiclesRoutes.js";
import { financingRoutes } from "../routes/financingRoutes.js";
import { promotionRoutes } from "../routes/promotionRoutes.js";
import { requireAdmin, requireAdminOrService } from "../middlewares/auth.js";

const adminId = "550e8400-e29b-41d4-a716-446655440000";
const sellerId = "550e8400-e29b-41d4-a716-446655440001";

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
  send() {
    return this;
  },
});

const stub = (obj, key, impl) => {
  const original = obj[key];
  obj[key] = impl;
  return () => {
    obj[key] = original;
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

test("listClients: admin ve todo el tenant, seller solo asignados", async () => {
  const wheres = [];
  const restore = stub(ClientLead, "findAll", async (opts) => {
    wheres.push(opts.where);
    return [];
  });
  try {
    await call(listClients, { auth: adminAuth });
    await call(listClients, { auth: sellerAuth });
  } finally {
    restore();
  }
  assert.equal(wheres[0].ownerUserId, adminId);
  assert.equal(wheres[0].assignedSellerUserId, undefined);
  assert.equal(wheres[1].ownerUserId, adminId);
  assert.equal(wheres[1].assignedSellerUserId, sellerId);
});

test("getClient: seller recibe 404 si el lead no es suyo", async () => {
  const restore = stub(ClientLead, "findOne", async (opts) => {
    // Simula DB: el lead existe pero asignado a otro/ninguno => el filtro no coincide.
    return opts.where.assignedSellerUserId === sellerId ? null : { id: opts.where.id };
  });
  try {
    const seller = await call(getClient, { auth: sellerAuth, params: { id: "lead-1" } });
    assert.equal(seller.error?.status, 404);
    const admin = await call(getClient, { auth: adminAuth, params: { id: "lead-1" } });
    assert.equal(admin.error, undefined);
    assert.equal(admin.res.payload.id, "lead-1");
  } finally {
    restore();
  }
});

test("patchClient: seller no puede editar leads no asignados", async () => {
  const restore = stub(ClientLead, "findOne", async (opts) =>
    opts.where.assignedSellerUserId === sellerId ? null : { id: opts.where.id }
  );
  try {
    const { error } = await call(patchClient, {
      auth: sellerAuth,
      params: { id: "lead-1" },
      body: { name: "X", status: "lead" },
    });
    assert.equal(error?.status, 404);
  } finally {
    restore();
  }
});

test("createClient: seller recibe 403", async () => {
  const { error } = await call(createClient, {
    auth: sellerAuth,
    body: { name: "Luis", phone: "5511111111" },
  });
  assert.equal(error?.status, 403);
});

test("listConversations: seller filtra por lead asignado (include required)", async () => {
  const opts = [];
  const restore = stub(Conversation, "findAll", async (o) => {
    opts.push(o);
    return [];
  });
  try {
    await call(listConversations, { auth: adminAuth });
    await call(listConversations, { auth: sellerAuth });
  } finally {
    restore();
  }
  assert.equal(opts[0].where.ownerUserId, adminId);
  assert.equal(opts[0].include[0].required, undefined);
  assert.equal(opts[1].where.ownerUserId, adminId);
  assert.equal(opts[1].include[0].required, true);
  assert.deepEqual(opts[1].include[0].where, { assignedSellerUserId: sellerId });
});

test("getConversationMessages: seller recibe 404 en conversación de lead ajeno", async () => {
  const restoreConv = stub(Conversation, "findOne", async () => null);
  const restoreMsg = stub(Message, "findAll", async () => {
    throw new Error("no debe consultar mensajes");
  });
  try {
    const { error } = await call(getConversationMessages, { auth: sellerAuth, params: { id: "c1" } });
    assert.equal(error?.status, 404);
  } finally {
    restoreConv();
    restoreMsg();
  }
});

test("createVehicle / createFinancingPlan usan el tenant del admin cuando crea un seller", async () => {
  let vehicleData;
  let planData;
  const restoreVehicle = stub(Vehicle, "create", async (d) => {
    vehicleData = d;
    return d;
  });
  const restorePlan = stub(FinancingPlan, "create", async (d) => {
    planData = d;
    return { id: "p1" };
  });
  const restoreFind = stub(FinancingPlan, "findByPk", async () => ({ id: "p1" }));
  try {
    await call(createVehicle, { auth: sellerAuth, body: { brand: "Suzuki", model: "Swift" } });
    await call(createFinancingPlan, {
      auth: sellerAuth,
      body: { name: "Plan", lender: "Banco", rate: 10, maxTermMonths: 48 },
    });
  } finally {
    restoreVehicle();
    restorePlan();
    restoreFind();
  }
  assert.equal(vehicleData.ownerUserId, adminId);
  assert.equal(planData.ownerUserId, adminId);
});

test("getAccountProfile: seller no recibe business ni crea BusinessProfile", async () => {
  const restoreUser = stub(User, "findByPk", async () => ({
    id: sellerId,
    email: "s@x.com",
    name: "Sol",
    phone: null,
    defaultPlatform: null,
    calendarSchedulingUrl: null,
    role: "seller",
    tenantOwnerUserId: adminId,
  }));
  const restoreBusiness = stub(BusinessProfile, "findOrCreate", async () => {
    throw new Error("no debe crear business para vendedor");
  });
  const botLookups = [];
  const restoreBot = stub(BotSetting, "findOne", async (opts) => {
    botLookups.push(opts.where);
    return { timezone: "America/Mexico_City" };
  });
  try {
    const { res, error } = await call(getAccountProfile, { auth: sellerAuth });
    assert.equal(error, undefined);
    assert.equal(res.payload.business, null);
    assert.deepEqual(res.payload.tenant, { timezone: "America/Mexico_City" });
    assert.deepEqual(botLookups[0], { ownerUserId: adminId });
    assert.equal(res.payload.user.role, "seller");
    assert.equal(res.payload.user.tenantOwnerUserId, adminId);
  } finally {
    restoreUser();
    restoreBusiness();
    restoreBot();
  }
});

test("patchAccountProfile: seller no puede cambiar calendario ni negocio (403)", async () => {
  const restoreUser = stub(User, "findByPk", async () => ({
    id: sellerId,
    role: "seller",
    tenantOwnerUserId: adminId,
    update: async () => {},
    reload: async () => {},
  }));
  try {
    const calendar = await call(patchAccountProfile, {
      auth: sellerAuth,
      body: { user: { calendarSchedulingUrl: "https://calendar.app.google/abc" } },
    });
    assert.equal(calendar.error?.status, 403);
    const business = await call(patchAccountProfile, {
      auth: sellerAuth,
      body: { business: { tradeName: "Mi negocio" } },
    });
    assert.equal(business.error?.status, 403);
    const own = await call(patchAccountProfile, { auth: sellerAuth, body: { user: { name: "Sol Nueva" } } });
    assert.equal(own.error, undefined);
    assert.equal(own.res.payload.business, null);
  } finally {
    restoreUser();
  }
});

test("deleteAccount: seller recibe 403", async () => {
  const { error } = await call(deleteAccount, { auth: sellerAuth, body: { confirmText: "ELIMINAR" } });
  assert.equal(error?.status, 403);
});

const routeHandlers = (router, method, path) => {
  const layer = router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
  assert.ok(layer, `ruta ${method} ${path} no encontrada`);
  return layer.route.stack.map((l) => l.handle);
};

test("rutas de tenant (FAQs, blacklist, bot, integraciones, tokens) exigen admin", () => {
  const adminOnly = [
    [faqRoutes, "get", "/faqs"],
    [faqRoutes, "post", "/faqs"],
    [faqRoutes, "patch", "/faqs/:id"],
    [faqRoutes, "delete", "/faqs/:id"],
    [blacklistRoutes, "get", "/blacklist"],
    [blacklistRoutes, "post", "/blacklist"],
    [blacklistRoutes, "delete", "/blacklist/:id"],
    [botSettingsRoutes, "patch", "/bot/settings"],
    [accountRoutes, "get", "/integrations"],
    [accountRoutes, "post", "/integrations"],
    [accountRoutes, "post", "/integrations/whatsapp/meta/signup"],
    [accountRoutes, "put", "/integrations/whatsapp/meta/templates/followup"],
    [accountRoutes, "delete", "/account"],
    [authRoutes, "get", "/service-tokens"],
    [authRoutes, "post", "/service-tokens"],
    [authRoutes, "post", "/service-tokens/:id/revoke"],
  ];
  for (const [router, method, path] of adminOnly) {
    assert.ok(routeHandlers(router, method, path).includes(requireAdmin), `${method} ${path} sin requireAdmin`);
  }
  const adminOrService = [
    [botSettingsRoutes, "get", "/bot/settings"],
    [botConversationRoutes, "post", "/bot/reset-conversation"],
  ];
  for (const [router, method, path] of adminOrService) {
    assert.ok(
      routeHandlers(router, method, path).includes(requireAdminOrService),
      `${method} ${path} sin requireAdminOrService`
    );
  }
});

test("rutas de catálogo (vehículos, financiamiento, promos) NO exigen admin", () => {
  const open = [
    [vehiclesRoutes, "post", "/vehicles"],
    [vehiclesRoutes, "patch", "/vehicles/:id"],
    [vehiclesRoutes, "delete", "/vehicles/:id"],
    [financingRoutes, "post", "/financing-plans"],
    [financingRoutes, "delete", "/financing-plans/:id"],
    [financingRoutes, "post", "/financing-requirements"],
    [promotionRoutes, "post", "/promotions"],
    [promotionRoutes, "delete", "/promotions/:id"],
  ];
  for (const [router, method, path] of open) {
    const handlers = routeHandlers(router, method, path);
    assert.equal(handlers.includes(requireAdmin), false, `${method} ${path} no debe exigir admin`);
  }
});
