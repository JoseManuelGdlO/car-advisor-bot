import test from "node:test";
import assert from "node:assert/strict";
import { botSetControlSchema } from "./botConversationController.js";

test("botSetControlSchema valida handoff del bot", () => {
  const payload = botSetControlSchema.parse({ isHumanControlled: true });
  assert.equal(payload.isHumanControlled, true);
});
