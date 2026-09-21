import test from "node:test";
import assert from "node:assert/strict";
import { Message } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { buildReminderOutboundText, processConversationReminder } from "./botReminderService.js";

test("buildReminderOutboundText combines follow-up and last bot question", () => {
  assert.equal(
    buildReminderOutboundText({
      reminderMessage: "¿Sigues interesado? Estoy aquí para ayudarte.",
      lastBotText: "¿Cuál es tu presupuesto aproximado?",
    }),
    "¿Sigues interesado? Estoy aquí para ayudarte.\n\n¿Cuál es tu presupuesto aproximado?"
  );
});

test("buildReminderOutboundText returns null when last bot text is missing", () => {
  assert.equal(
    buildReminderOutboundText({
      reminderMessage: "¿Sigues interesado?",
      lastBotText: "",
    }),
    null
  );
  assert.equal(
    buildReminderOutboundText({
      reminderMessage: "¿Sigues interesado?",
      lastBotText: "   ",
    }),
    null
  );
  assert.equal(
    buildReminderOutboundText({
      reminderMessage: "¿Sigues interesado?",
      lastBotText: null,
    }),
    null
  );
});

test("buildReminderOutboundText does not duplicate when texts are equal", () => {
  assert.equal(
    buildReminderOutboundText({
      reminderMessage: "¿Sigues interesado?",
      lastBotText: "¿Sigues interesado?",
    }),
    "¿Sigues interesado?"
  );
});

test("buildReminderOutboundText trims both sides", () => {
  assert.equal(
    buildReminderOutboundText({
      reminderMessage: "  ¿Sigues ahí?  ",
      lastBotText: "  ¿Cuál es tu presupuesto?  ",
    }),
    "¿Sigues ahí?\n\n¿Cuál es tu presupuesto?"
  );
});

test("stamps lastReminderAt on Graph 24h re-engagement errors without rethrowing", async () => {
  const originalFindOne = Message.findOne;
  const updates = [];
  const conversation = {
    id: "conv-24h",
    ownerUserId: "owner-1",
    channel: "whatsapp",
    isHumanControlled: false,
    client: null,
    update: async (fields) => {
      updates.push(fields);
    },
  };

  Message.findOne = async () => ({
    from: "bot",
    text: "¿Cuál es tu presupuesto aproximado?",
  });

  const graphError = new ApiError(
    400,
    "Han pasado más de 24 horas. Debes usar una plantilla aprobada."
  );
  graphError.meta = { message: "Message failed to send because more than 24 hours have passed. Please use a re-engagement template." };

  try {
    await processConversationReminder({
      conversation,
      reminderMessage: "¿Sigues interesado?",
      sendTextMessage: async () => {
        throw graphError;
      },
    });

    assert.equal(updates.length, 1);
    assert.ok(updates[0].lastReminderAt instanceof Date);
  } finally {
    Message.findOne = originalFindOne;
  }
});
