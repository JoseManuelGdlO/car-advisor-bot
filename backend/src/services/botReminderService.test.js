import test from "node:test";
import assert from "node:assert/strict";
import { Message } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import {
  buildReminderOutboundText,
  isWhatsappCustomerWindowOpen,
  processConversationReminder,
} from "./botReminderService.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const LAST_BOT_TEXT = "¿Cuál es tu presupuesto aproximado?";
const REMINDER_MESSAGE = "¿Sigues interesado?";
const SESSION_OUTBOUND = `${REMINDER_MESSAGE}\n\n${LAST_BOT_TEXT}`;
const HSM_BODY = "Hola, te escribimos de nuevo por si sigues interesado.";

const hoursAgo = (hours) => new Date(Date.now() - hours * HOUR_MS);

const stubLatestBotMessage = () => {
  const originalFindOne = Message.findOne;
  Message.findOne = async () => ({
    from: "bot",
    text: LAST_BOT_TEXT,
  });
  return () => {
    Message.findOne = originalFindOne;
  };
};

const makeConversation = ({ channel = "whatsapp" } = {}) => {
  const updates = [];
  return {
    updates,
    conversation: {
      id: "conv-followup",
      ownerUserId: "owner-1",
      channel,
      isHumanControlled: false,
      client: null,
      update: async (fields) => {
        updates.push(fields);
      },
    },
  };
};

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
      getLastClientAt: async () => hoursAgo(1),
    });

    assert.equal(updates.length, 1);
    assert.ok(updates[0].lastReminderAt instanceof Date);
  } finally {
    Message.findOne = originalFindOne;
  }
});

test("isWhatsappCustomerWindowOpen is false without last client message", () => {
  assert.equal(isWhatsappCustomerWindowOpen(null), false);
  assert.equal(isWhatsappCustomerWindowOpen(undefined), false);
  assert.equal(isWhatsappCustomerWindowOpen(""), false);
});

test("isWhatsappCustomerWindowOpen is true when last client is within 24h", () => {
  const now = Date.parse("2026-09-24T18:00:00.000Z");
  assert.equal(isWhatsappCustomerWindowOpen(new Date(now - HOUR_MS), now), true);
});

test("isWhatsappCustomerWindowOpen is false at 24h or later", () => {
  const now = Date.parse("2026-09-24T18:00:00.000Z");
  assert.equal(isWhatsappCustomerWindowOpen(new Date(now - DAY_MS), now), false);
  assert.equal(isWhatsappCustomerWindowOpen(new Date(now - DAY_MS - 1), now), false);
});

test("processConversationReminder sends session text when WhatsApp window is open", async () => {
  const restoreFindOne = stubLatestBotMessage();
  const { conversation, updates } = makeConversation();
  const textCalls = [];
  const templateCalls = [];

  try {
    await processConversationReminder({
      conversation,
      reminderMessage: REMINDER_MESSAGE,
      sendTextMessage: async (args) => {
        textCalls.push(args);
      },
      sendTemplateMessage: async (args) => {
        templateCalls.push(args);
      },
      getLastClientAt: async () => hoursAgo(1),
    });

    assert.equal(textCalls.length, 1);
    assert.equal(textCalls[0].text, SESSION_OUTBOUND);
    assert.equal(templateCalls.length, 0);
    assert.equal(updates.length, 1);
    assert.ok(updates[0].lastReminderAt instanceof Date);
  } finally {
    restoreFindOne();
  }
});

test("processConversationReminder sends HSM BODY when Meta window is closed and template is APPROVED", async () => {
  const restoreFindOne = stubLatestBotMessage();
  const { conversation, updates } = makeConversation();
  const textCalls = [];
  const templateCalls = [];

  try {
    await processConversationReminder({
      conversation,
      reminderMessage: REMINDER_MESSAGE,
      sendTextMessage: async (args) => {
        textCalls.push(args);
      },
      sendTemplateMessage: async (args) => {
        templateCalls.push(args);
      },
      getLastClientAt: async () => hoursAgo(25),
      loadFollowupTemplate: async () => ({
        metaConnected: true,
        template: {
          name: "cab_sg_abc123de",
          language: "es_MX",
          status: "APPROVED",
          components: [{ type: "BODY", text: HSM_BODY }],
        },
      }),
    });

    assert.equal(textCalls.length, 0);
    assert.equal(templateCalls.length, 1);
    assert.equal(templateCalls[0].templateName, "cab_sg_abc123de");
    assert.equal(templateCalls[0].language, "es_MX");
    assert.equal(templateCalls[0].persistText, HSM_BODY);
    assert.notEqual(templateCalls[0].persistText, SESSION_OUTBOUND);
    assert.equal(updates.length, 1);
    assert.ok(updates[0].lastReminderAt instanceof Date);
  } finally {
    restoreFindOne();
  }
});

test("processConversationReminder skips lastReminderAt when Meta window is closed and template is PENDING", async () => {
  const restoreFindOne = stubLatestBotMessage();
  const { conversation, updates } = makeConversation();
  const textCalls = [];
  const templateCalls = [];

  try {
    await processConversationReminder({
      conversation,
      reminderMessage: REMINDER_MESSAGE,
      sendTextMessage: async (args) => {
        textCalls.push(args);
      },
      sendTemplateMessage: async (args) => {
        templateCalls.push(args);
      },
      getLastClientAt: async () => hoursAgo(25),
      loadFollowupTemplate: async () => ({
        metaConnected: true,
        template: {
          name: "cab_sg_pending1",
          language: "es_MX",
          status: "PENDING",
          components: [{ type: "BODY", text: HSM_BODY }],
        },
      }),
    });

    assert.equal(textCalls.length, 0);
    assert.equal(templateCalls.length, 0);
    assert.equal(updates.length, 0);
  } finally {
    restoreFindOne();
  }
});

test("processConversationReminder keeps session-text 24h catch on Instagram and never sends HSM", async () => {
  const restoreFindOne = stubLatestBotMessage();
  const { conversation, updates } = makeConversation({ channel: "instagram" });
  const templateCalls = [];
  const graphError = new ApiError(
    400,
    "Han pasado más de 24 horas. Debes usar una plantilla aprobada."
  );
  graphError.meta = { message: "Message failed to send because more than 24 hours have passed. Please use a re-engagement template." };

  try {
    await processConversationReminder({
      conversation,
      reminderMessage: REMINDER_MESSAGE,
      sendTextMessage: async () => {
        throw graphError;
      },
      sendTemplateMessage: async (args) => {
        templateCalls.push(args);
      },
      getLastClientAt: async () => hoursAgo(25),
      loadFollowupTemplate: async () => ({
        metaConnected: true,
        template: {
          name: "cab_sg_abc123de",
          language: "es_MX",
          status: "APPROVED",
          components: [{ type: "BODY", text: HSM_BODY }],
        },
      }),
    });

    assert.equal(templateCalls.length, 0);
    assert.equal(updates.length, 1);
    assert.ok(updates[0].lastReminderAt instanceof Date);
  } finally {
    restoreFindOne();
  }
});

test("processConversationReminder keeps session text for WhatsApp Connect when window is closed", async () => {
  const restoreFindOne = stubLatestBotMessage();
  const { conversation, updates } = makeConversation();
  const textCalls = [];
  const templateCalls = [];

  try {
    await processConversationReminder({
      conversation,
      reminderMessage: REMINDER_MESSAGE,
      sendTextMessage: async (args) => {
        textCalls.push(args);
      },
      sendTemplateMessage: async (args) => {
        templateCalls.push(args);
      },
      getLastClientAt: async () => hoursAgo(25),
      loadFollowupTemplate: async () => ({ metaConnected: false, template: null }),
    });

    assert.equal(textCalls.length, 1);
    assert.equal(textCalls[0].text, SESSION_OUTBOUND);
    assert.equal(templateCalls.length, 0);
    assert.equal(updates.length, 1);
    assert.ok(updates[0].lastReminderAt instanceof Date);
  } finally {
    restoreFindOne();
  }
});
