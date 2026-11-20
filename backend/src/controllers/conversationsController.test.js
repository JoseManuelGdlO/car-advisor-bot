import test from "node:test";
import assert from "node:assert/strict";
import { ChannelConversationContext, Conversation } from "../models/index.js";
import { sellerLeadAssignmentDeps } from "../services/sellerLeadAssignment.js";
import { ApiError } from "../utils/errors.js";
import { sendConversationAttachment, sendMessageSchema, setControlSchema, setConversationControl } from "./conversationsController.js";

test("sendMessageSchema acepta payload valido", () => {
  const payload = sendMessageSchema.parse({ text: "Hola cliente" });
  assert.equal(payload.text, "Hola cliente");
});

test("sendMessageSchema rechaza texto vacio", () => {
  assert.throws(() => sendMessageSchema.parse({ text: "" }));
});

test("setControlSchema valida bandera de control humano", () => {
  const payload = setControlSchema.parse({ isHumanControlled: true });
  assert.equal(payload.isHumanControlled, true);
});

test("setConversationControl no auto-asigna al tomar control desde el CRM", async () => {
  const adminId = "550e8400-e29b-41d4-a716-446655440000";
  const original = { ...sellerLeadAssignmentDeps };
  let listed = false;
  sellerLeadAssignmentDeps.listAssignableSellers = async () => {
    listed = true;
    return [];
  };
  const conv = {
    ownerUserId: adminId,
    channel: "whatsapp",
    client: { phone: "5511111111", assignedSellerUserId: null },
    async update(patch) {
      Object.assign(this, patch);
      return this;
    },
  };
  const originalFind = Conversation.findOne;
  const originalCtx = ChannelConversationContext.findOne;
  Conversation.findOne = async () => conv;
  ChannelConversationContext.findOne = async () => null;
  try {
    const res = { payload: null, json(value) { this.payload = value; return value; } };
    await setConversationControl(
      {
        auth: { type: "user", userId: adminId, role: "admin", tenantOwnerUserId: adminId },
        params: { id: "conv-1" },
        body: { isHumanControlled: true },
      },
      res,
    );
    assert.equal(listed, false);
    assert.equal(conv.client.assignedSellerUserId, null);
  } finally {
    Conversation.findOne = originalFind;
    ChannelConversationContext.findOne = originalCtx;
    Object.assign(sellerLeadAssignmentDeps, original);
  }
});

test("sendConversationAttachment falla cuando falta archivo adjunto", async () => {
  const req = {
    auth: { userId: "550e8400-e29b-41d4-a716-446655440000" },
    body: { caption: "Imagen del vehiculo" },
    params: { id: "1" },
  };
  const res = {
    status() {
      throw new Error("No debe responder cuando falta archivo");
    },
    json() {
      throw new Error("No debe responder cuando falta archivo");
    },
  };

  await assert.rejects(
    () => sendConversationAttachment(req, res),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.status, 400);
      assert.equal(error.message, "attachment file is required");
      return true;
    }
  );
});
