import test from "node:test";
import assert from "node:assert/strict";
import { Op } from "sequelize";
import { BlackListEntry } from "../models/index.js";
import {
  shouldIgnoreBlacklistedWhatsappEvent,
  UNSUPPORTED_INBOUND_CRM_CLIENT_MESSAGE,
  UNSUPPORTED_INBOUND_OUTBOUND_REPLY,
} from "./wcWebhookIngestionService.js";

test("textos fijos de solo-media mencionan texto y el mensaje CRM no está vacío", () => {
  assert.match(UNSUPPORTED_INBOUND_OUTBOUND_REPLY, /texto/i);
  assert.ok(UNSUPPORTED_INBOUND_CRM_CLIENT_MESSAGE.length > 0);
});

test("shouldIgnoreBlacklistedWhatsappEvent consulta la blacklist por displayPhone", async () => {
  const originalFindOne = BlackListEntry.findOne;
  let capturedWhere = null;
  BlackListEntry.findOne = async ({ where }) => {
    capturedWhere = where;
    return { id: "blocked-1" };
  };

  try {
    const result = await shouldIgnoreBlacklistedWhatsappEvent({
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      displayPhone: "6181556489",
    });
    assert.equal(result, true);
    assert.equal(capturedWhere.ownerUserId, "11111111-1111-4111-8111-111111111111");
    assert.deepEqual(capturedWhere.phone[Op.in], ["5216181556489", "6181556489"]);
  } finally {
    BlackListEntry.findOne = originalFindOne;
  }
});
