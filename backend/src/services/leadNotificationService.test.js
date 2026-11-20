import test from "node:test";
import assert from "node:assert/strict";
import { ChannelConversationContext, ClientLead, Conversation, User } from "../models/index.js";
import { computeRecipientUserIds, resolveNotificationRecipients } from "./notificationRecipients.js";
import { leadNotificationDeps, sendPushToLeadRecipients } from "./leadNotificationService.js";
import { sellerLeadAssignmentDeps } from "./sellerLeadAssignment.js";
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

// --- Contrato del payload real del bot (`notify_advisor` -> POST /bot/push-notify) ---
const botPayloadData = (kind, extra = {}) => ({
  notification_kind: kind,
  selected_car: "Mazda 3",
  customer_name: "",
  customer_phone: "",
  customer_email: "",
  financing_selection: "{}",
  promotion_selection: "{}",
  ...extra,
});

const runBotPush = async (data) => {
  const original = { ...leadNotificationDeps };
  const sent = [];
  leadNotificationDeps.sendPushToOwner = async (args) => {
    sent.push(args.ownerUserId);
    return { sentCount: 1, failedCount: 0, deactivatedCount: 0 };
  };
  try {
    await sendPushToLeadRecipients({ ownerUserId: adminId, title: "t", body: "b", data });
    return sent;
  } finally {
    Object.assign(leadNotificationDeps, original);
  }
};

const assignedLeadStubs = (extra = []) => [
  [User, "findOne", async () => ({ id: sellerId, active: true })],
  [User, "findByPk", async () => ({ id: adminId, notifyAssignedLeadMessages: true })],
  ...extra,
];

const allDaySchedule = () => ({
  monday: [{ start: "00:00", end: "23:59" }],
  tuesday: [{ start: "00:00", end: "23:59" }],
  wednesday: [{ start: "00:00", end: "23:59" }],
  thursday: [{ start: "00:00", end: "23:59" }],
  friday: [{ start: "00:00", end: "23:59" }],
  saturday: [{ start: "00:00", end: "23:59" }],
  sunday: [{ start: "00:00", end: "23:59" }],
});

test("escalación sin vendedor auto-asigna y notifica al elegido", async () => {
  const lead = {
    id: leadId,
    assignedSellerUserId: null,
  };
  const originalAssign = { ...sellerLeadAssignmentDeps };
  sellerLeadAssignmentDeps.getOrCreateBotSettings = async () => ({ timezone: "America/Mexico_City" });
  sellerLeadAssignmentDeps.listAssignableSellers = async () => [
    { id: sellerId, active: true, autoAssignLeads: true, weeklySchedule: allDaySchedule() },
  ];
  const restore = stubAll([
    [Conversation, "findOne", async () => ({ id: convId, clientLeadId: leadId })],
    [ClientLead, "findOne", async () => lead],
    [ClientLead, "update", async () => [1]],
    [User, "findOne", async () => ({ id: sellerId, active: true })],
    [User, "findByPk", async () => ({ id: adminId, notifyAssignedLeadMessages: true })],
  ]);
  try {
    const sent = await runBotPush(botPayloadData("human_advisor", { conversationId: convId }));
    assert.equal(lead.assignedSellerUserId, sellerId);
    assert.deepEqual(sent, [adminId, sellerId]);
  } finally {
    restore();
    Object.assign(sellerLeadAssignmentDeps, originalAssign);
  }
});

test("inbound de lead sin asignar no dispara auto-asignación", async () => {
  const originalAssign = { ...sellerLeadAssignmentDeps };
  let listed = false;
  sellerLeadAssignmentDeps.listAssignableSellers = async () => {
    listed = true;
    return [];
  };
  const restore = stubAll([
    [Conversation, "findOne", async () => ({ id: convId, clientLeadId: leadId })],
    [ClientLead, "findOne", async () => ({ id: leadId, assignedSellerUserId: null })],
  ]);
  try {
    const sent = await runBotPush(botPayloadData("new_inbound_message", { conversationId: convId }));
    assert.equal(listed, false);
    assert.deepEqual(sent, [adminId]);
  } finally {
    restore();
    Object.assign(sellerLeadAssignmentDeps, originalAssign);
  }
});

test("contrato bot: lead_interest/human_advisor/financing con conversationId (sin teléfono) notifican vendedor + admin", async () => {
  const restore = stubAll(
    assignedLeadStubs([
      [Conversation, "findOne", async () => ({ id: convId, clientLeadId: leadId })],
      [ClientLead, "findOne", async () => ({ id: leadId, assignedSellerUserId: sellerId })],
    ]),
  );
  try {
    for (const kind of ["lead_interest", "human_advisor", "financing_detail_help"]) {
      const sent = await runBotPush(botPayloadData(kind, { conversationId: convId }));
      assert.deepEqual(sent, [adminId, sellerId], kind);
    }
  } finally {
    restore();
  }
});

test("contrato bot: sin conversationId, channelUserId resuelve el lead por el contexto del canal", async () => {
  const contextLookups = [];
  const restore = stubAll(
    assignedLeadStubs([
      [
        ChannelConversationContext,
        "findOne",
        async (opts) => {
          contextLookups.push(opts.where);
          return { id: "ctx", conversationId: convId, clientLeadId: leadId };
        },
      ],
      [ClientLead, "findOne", async () => ({ id: leadId, assignedSellerUserId: sellerId })],
    ]),
  );
  try {
    const sent = await runBotPush(botPayloadData("lead_interest", { channelUserId: "5215512345678" }));
    assert.deepEqual(sent, [adminId, sellerId]);
    assert.deepEqual(contextLookups[0], { ownerUserId: adminId, externalUserId: "5215512345678" });
  } finally {
    restore();
  }
});

test("contrato bot: channelUserId sin contexto cae al teléfono del lead (ClientLead.phone)", async () => {
  const restore = stubAll(
    assignedLeadStubs([
      [ChannelConversationContext, "findOne", async () => null],
      [ClientLead, "findOne", async () => ({ id: leadId, assignedSellerUserId: sellerId })],
    ]),
  );
  try {
    const sent = await runBotPush(botPayloadData("human_advisor", { channelUserId: "5215512345678" }));
    assert.deepEqual(sent, [adminId, sellerId]);
  } finally {
    restore();
  }
});

test("resolveNotificationRecipients: lead no resuelto => solo admin y se registra warn", async () => {
  const { appLog } = await import("../utils/appLogger.js");
  const originalWarn = appLog.warn;
  const warnings = [];
  appLog.warn = (tag, line) => warnings.push([tag, line]);
  const restore = stubAll([
    [ChannelConversationContext, "findOne", async () => null],
    [ClientLead, "findOne", async () => null],
  ]);
  try {
    const result = await resolveNotificationRecipients({
      ownerUserId: adminId,
      kind: "lead_interest",
      channelUserId: "desconocido",
    });
    assert.deepEqual(result.recipientUserIds, [adminId]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0][1], /lead not resolved/);
    assert.match(warnings[0][1], /hasChannelUserId=true/);
  } finally {
    appLog.warn = originalWarn;
    restore();
  }
});
