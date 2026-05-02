import test from "node:test";
import assert from "node:assert/strict";
import { botPushNotify, sendPush } from "./pushController.js";

const ownerA = "550e8400-e29b-41d4-a716-446655440000";
const ownerB = "550e8400-e29b-41d4-a716-446655440001";

const createResponse = () => ({
  json() {
    throw new Error("response should not be sent for rejected owner");
  },
});

test("botPushNotify blocks service tokens from targeting another owner", async () => {
  const req = {
    auth: { type: "service", userId: ownerA },
    body: {
      owner_user_id: ownerB,
      title: "Nuevo lead",
      body: "Cliente listo para seguimiento",
      data: { source: "bot" },
    },
  };

  let nextError;
  await botPushNotify(req, createResponse(), (error) => {
    nextError = error;
  });

  assert.equal(nextError?.status, 403);
  assert.match(nextError?.message, /another owner/);
});

test("sendPush blocks service tokens from targeting another owner", async () => {
  const req = {
    auth: { type: "service", userId: ownerA },
    body: {
      ownerUserId: ownerB,
      title: "Nuevo mensaje",
      body: "Cliente quiere platicar",
      data: { conversationId: "abc" },
    },
  };

  let nextError;
  await sendPush(req, createResponse(), (error) => {
    nextError = error;
  });

  assert.equal(nextError?.status, 403);
  assert.match(nextError?.message, /another owner/);
});
