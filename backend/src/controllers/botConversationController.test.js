import test from "node:test";
import assert from "node:assert/strict";
import { botResetConversationSchema, botSetControlSchema } from "./botConversationController.js";

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
