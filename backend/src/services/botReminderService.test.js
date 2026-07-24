import test from "node:test";
import assert from "node:assert/strict";
import { buildReminderOutboundText } from "./botReminderService.js";

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
