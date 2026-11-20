import test from "node:test";
import assert from "node:assert/strict";
import { ChannelConversationContext, ClientLead, Conversation } from "../models/index.js";
import { sellerLeadAssignmentDeps } from "../services/sellerLeadAssignment.js";
import { botResetConversationSchema, botSetControlSchema, botSetConversationControl } from "./botConversationController.js";

const adminId = "550e8400-e29b-41d4-a716-446655440000";
const sellerId = "550e8400-e29b-41d4-a716-446655440001";
const convId = "550e8400-e29b-41d4-a716-446655440007";

const stubAll = (stubs) => {
  const originals = stubs.map(([obj, key]) => [obj, key, obj[key]]);
  for (const [obj, key, impl] of stubs) obj[key] = impl;
  return () => {
    for (const [obj, key, original] of originals) obj[key] = original;
  };
};

const allDaySchedule = () => ({
  monday: [{ start: "00:00", end: "23:59" }],
  tuesday: [{ start: "00:00", end: "23:59" }],
  wednesday: [{ start: "00:00", end: "23:59" }],
  thursday: [{ start: "00:00", end: "23:59" }],
  friday: [{ start: "00:00", end: "23:59" }],
  saturday: [{ start: "00:00", end: "23:59" }],
  sunday: [{ start: "00:00", end: "23:59" }],
});

test("botSetControlSchema valida handoff del bot", () => {
  const payload = botSetControlSchema.parse({ isHumanControlled: true });
  assert.equal(payload.isHumanControlled, true);
});

test("botResetConversationSchema acepta resetAll opcional", () => {
  const payload = botResetConversationSchema.parse({
    user_id: "60911863783463@lid",
    platform: "whatsapp",
    owner_user_id: "748dab00-e01e-4f82-a658-848cf630197e",
    resetAll: true,
  });
  assert.equal(payload.resetAll, true);
  assert.equal(payload.user_id, "60911863783463@lid");
});

test("botResetConversationSchema permite omitir resetAll", () => {
  const payload = botResetConversationSchema.parse({
    user_id: "60911863783463@lid",
    platform: "whatsapp",
  });
  assert.equal(payload.resetAll, undefined);
});

test("botSetConversationControl: al ceder control asigna vendedor en horario", async () => {
  const lead = {
    id: "lead-1",
    assignedSellerUserId: null,
    phone: "5511111111",
  };
  const conv = {
    id: convId,
    ownerUserId: adminId,
    channel: "whatsapp",
    client: lead,
    async update(patch) {
      Object.assign(conv, patch);
      return conv;
    },
  };
  const original = { ...sellerLeadAssignmentDeps };
  sellerLeadAssignmentDeps.getOrCreateBotSettings = async () => ({ timezone: "America/Mexico_City" });
  sellerLeadAssignmentDeps.listAssignableSellers = async () => [
    { id: sellerId, active: true, autoAssignLeads: true, weeklySchedule: allDaySchedule() },
  ];
  const restore = stubAll([
    [Conversation, "findOne", async () => conv],
    [ChannelConversationContext, "findOne", async () => ({ externalUserId: "5511111111" })],
    [ClientLead, "update", async () => [1]],
  ]);
  try {
    const res = { payload: null, json(value) { this.payload = value; return value; } };
    await botSetConversationControl(
      {
        auth: { type: "user", userId: adminId, role: "admin", tenantOwnerUserId: adminId },
        params: { conversationId: convId },
        body: { isHumanControlled: true },
      },
      res,
    );
    assert.equal(lead.assignedSellerUserId, sellerId);
    assert.equal(conv.isHumanControlled, true);
  } finally {
    restore();
    Object.assign(sellerLeadAssignmentDeps, original);
  }
});
