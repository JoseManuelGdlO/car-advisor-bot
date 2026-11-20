import test from "node:test";
import assert from "node:assert/strict";
import { ClientLead, Conversation, User } from "../models/index.js";
import { computeRecipientUserIds, resolveNotificationRecipients } from "./notificationRecipients.js";
import { leadNotificationDeps, sendPushToLeadRecipients } from "./leadNotificationService.js";
import { toAccountNotificationPreferencesDto } from "./notificationPreferences.js";
import { getNotificationPreferences, patchNotificationPreferences } from "../controllers/accountController.js";

const adminId = "550e8400-e29b-41d4-a716-446655440000";
const sellerId = "550e8400-e29b-41d4-a716-446655440001";
const convId = "550e8400-e29b-41d4-a716-446655440007";
const leadId = "550e8400-e29b-41d4-a716-446655440009";

const stubAll = (stubs) => {
  const originals = stubs.map(([obj, key]) => [obj, key, obj[key]]);
  for (const [obj, key, impl] of stubs) obj[key] = impl;
  return () => {
    for (const [obj, key, original] of originals) obj[key] = original;
  };
};

test("computeRecipientUserIds: lead sin asignar => solo admin", () => {
  assert.deepEqual(
    computeRecipientUserIds({ adminUserId: adminId, kind: "new_inbound_message" }),
    [adminId]
  );
});

test("computeRecipientUserIds: lead asignado => admin + vendedor", () => {
  assert.deepEqual(
    computeRecipientUserIds({
      adminUserId: adminId,
      assignedSellerUserId: sellerId,
      kind: "new_inbound_message",
    }),
    [adminId, sellerId]
  );
});

test("computeRecipientUserIds: admin con notifyAssignedLeadMessages=false no recibe inbound de asignados", () => {
  assert.deepEqual(
    computeRecipientUserIds({
      adminUserId: adminId,
      assignedSellerUserId: sellerId,
      adminNotifyAssignedLeadMessages: false,
      kind: "new_inbound_message",
    }),
    [sellerId]
  );
});

test("computeRecipientUserIds: escalaciones siguen yendo a ambos aunque el admin haya desactivado inbound", () => {
  for (const kind of ["human_advisor", "financing_detail_help", "lead_interest"]) {
    assert.deepEqual(
      computeRecipientUserIds({
        adminUserId: adminId,
        assignedSellerUserId: sellerId,
        adminNotifyAssignedLeadMessages: false,
        kind,
      }),
      [adminId, sellerId],
      kind
    );
  }
});

test("computeRecipientUserIds: lead sin asignar ignora la opción del admin (inbound llega al admin)", () => {
  assert.deepEqual(
    computeRecipientUserIds({
      adminUserId: adminId,
      adminNotifyAssignedLeadMessages: false,
      kind: "new_inbound_message",
    }),
    [adminId]
  );
});

test("resolveNotificationRecipients: ignora vendedor inactivo o de otro tenant", async () => {
  const lead = { id: leadId, assignedSellerUserId: sellerId };
  const restore = stubAll([
    [User, "findOne", async () => ({ id: sellerId, active: false })],
    [User, "findByPk", async () => ({ id: adminId, notifyAssignedLeadMessages: true })],
  ]);
  try {
    const inactive = await resolveNotificationRecipients({ ownerUserId: adminId, kind: "new_inbound_message", lead });
    assert.deepEqual(inactive.recipientUserIds, [adminId]);
  } finally {
    restore();
  }
  const restoreMissing = stubAll([[User, "findOne", async () => null]]);
  try {
    const other = await resolveNotificationRecipients({ ownerUserId: adminId, kind: "new_inbound_message", lead });
    assert.deepEqual(other.recipientUserIds, [adminId]);
  } finally {
    restoreMissing();
  }
});

test("resolveNotificationRecipients: resuelve el lead por conversationId y aplica preferencia del admin", async () => {
  const lookups = [];
  const restore = stubAll([
    [Conversation, "findOne", async () => ({ id: convId, clientLeadId: leadId })],
    [
      ClientLead,
      "findOne",
      async (opts) => {
        lookups.push(opts.where);
        return { id: leadId, assignedSellerUserId: sellerId };
      },
    ],
    [User, "findOne", async () => ({ id: sellerId, active: true })],
    [User, "findByPk", async () => ({ id: adminId, notifyAssignedLeadMessages: false })],
  ]);
  try {
    const inbound = await resolveNotificationRecipients({
      ownerUserId: adminId,
      kind: "new_inbound_message",
      conversationId: convId,
    });
    assert.deepEqual(inbound.recipientUserIds, [sellerId]);
    const escalation = await resolveNotificationRecipients({
      ownerUserId: adminId,
      kind: "human_advisor",
      conversationId: convId,
    });
    assert.deepEqual(escalation.recipientUserIds, [adminId, sellerId]);
    assert.deepEqual(lookups[0], { id: leadId, ownerUserId: adminId });
  } finally {
    restore();
  }
});

test("resolveNotificationRecipients: sin lead identificable notifica solo al admin", async () => {
  const restore = stubAll([[ClientLead, "findOne", async () => null]]);
  try {
    const result = await resolveNotificationRecipients({
      ownerUserId: adminId,
      kind: "lead_interest",
      customerPhone: "5512345678",
    });
    assert.deepEqual(result.recipientUserIds, [adminId]);
  } finally {
    restore();
  }
});

test("sendPushToLeadRecipients: envía a cada receptor con su propio userId y agrega resultados", async () => {
  const original = { ...leadNotificationDeps };
  const calls = [];
  leadNotificationDeps.resolveNotificationRecipients = async () => ({ recipientUserIds: [adminId, sellerId] });
  leadNotificationDeps.sendPushToOwner = async (args) => {
    calls.push(args);
    return { sentCount: 1, failedCount: 0, deactivatedCount: 0 };
  };
  try {
    const result = await sendPushToLeadRecipients({
      ownerUserId: adminId,
      title: "Hola",
      body: "Mensaje",
      data: { notification_kind: "new_inbound_message", conversationId: convId },
    });
    assert.deepEqual(
      calls.map((c) => c.ownerUserId),
      [adminId, sellerId]
    );
    assert.equal(result.sentCount, 2);
    assert.equal(result.recipientCount, 2);
    assert.deepEqual(result.recipientUserIds, [adminId, sellerId]);
  } finally {
    Object.assign(leadNotificationDeps, original);
  }
});

test("sendPushToLeadRecipients: si falla la resolución, cae al admin", async () => {
  const original = { ...leadNotificationDeps };
  const calls = [];
  const originalError = console.error;
  console.error = () => {};
  leadNotificationDeps.resolveNotificationRecipients = async () => {
    throw new Error("db down");
  };
  leadNotificationDeps.sendPushToOwner = async (args) => {
    calls.push(args.ownerUserId);
    return { sentCount: 0, failedCount: 0, deactivatedCount: 0 };
  };
  try {
    await sendPushToLeadRecipients({ ownerUserId: adminId, title: "t", body: "b", data: {} });
    assert.deepEqual(calls, [adminId]);
  } finally {
    console.error = originalError;
    Object.assign(leadNotificationDeps, original);
  }
});

test("toAccountNotificationPreferencesDto: notifyAssignedLeadMessages solo para admin", () => {
  const user = { notifyAssignedLeadMessages: false };
  assert.equal(toAccountNotificationPreferencesDto(user, { isAdmin: true }).notifyAssignedLeadMessages, false);
  assert.equal("notifyAssignedLeadMessages" in toAccountNotificationPreferencesDto(user, { isAdmin: false }), false);
  assert.equal(toAccountNotificationPreferencesDto({}, { isAdmin: true }).notifyAssignedLeadMessages, true);
});

const adminAuth = { type: "user", userId: adminId, role: "admin", tenantOwnerUserId: adminId };
const sellerAuth = { type: "user", userId: sellerId, role: "seller", tenantOwnerUserId: adminId };

const callHandler = async (handler, req) => {
  const res = {
    payload: null,
    status() {
      return this;
    },
    json(v) {
      this.payload = v;
    },
  };
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

test("preferencias de notificación: admin lee/edita notifyAssignedLeadMessages; seller no", async () => {
  const row = {
    id: adminId,
    pushEnabled: true,
    notifyLeadInterest: true,
    notifyEscalations: true,
    notifyInboundMessages: true,
    notifyAssignedLeadMessages: true,
    async update(patch) {
      Object.assign(row, patch);
    },
    async reload() {},
  };
  const restore = stubAll([[User, "findByPk", async () => row]]);
  try {
    const read = await callHandler(getNotificationPreferences, { auth: adminAuth });
    assert.equal(read.res.payload.notifyAssignedLeadMessages, true);

    const patched = await callHandler(patchNotificationPreferences, {
      auth: adminAuth,
      body: { notifyAssignedLeadMessages: false },
    });
    assert.equal(patched.error, undefined);
    assert.equal(row.notifyAssignedLeadMessages, false);
    assert.equal(patched.res.payload.notifyAssignedLeadMessages, false);

    const sellerRead = await callHandler(getNotificationPreferences, { auth: sellerAuth });
    assert.equal("notifyAssignedLeadMessages" in sellerRead.res.payload, false);

    const sellerPatch = await callHandler(patchNotificationPreferences, {
      auth: sellerAuth,
      body: { notifyAssignedLeadMessages: false },
    });
    assert.equal(sellerPatch.error?.status, 403);

    const sellerOwn = await callHandler(patchNotificationPreferences, {
      auth: sellerAuth,
      body: { pushEnabled: false },
    });
    assert.equal(sellerOwn.error, undefined);
  } finally {
    restore();
  }
});
