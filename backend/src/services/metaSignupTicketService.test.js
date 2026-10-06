import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import { MetaSignupTicket } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { sha256 } from "../utils/auth.js";
import {
  SIGNUP_TICKET_MISSING_URL_MESSAGE,
  completeMetaSignupTicket,
  createMetaSignupTicket,
} from "./metaSignupTicketService.js";

const originalMeta = { ...env.meta };
const originalPublicUrl = process.env.BACKEND_PUBLIC_URL;
const originalCreate = MetaSignupTicket.create;
const originalFindOne = MetaSignupTicket.findOne;
const originalUpdate = MetaSignupTicket.update;

function configureMeta() {
  env.meta.appId = "app-id";
  env.meta.configId = "cfg-id";
  env.meta.appSecret = "app-secret";
  env.meta.graphApiVersion = "v21.0";
}

test.afterEach(() => {
  Object.assign(env.meta, originalMeta);
  if (originalPublicUrl == null) delete process.env.BACKEND_PUBLIC_URL;
  else process.env.BACKEND_PUBLIC_URL = originalPublicUrl;
  MetaSignupTicket.create = originalCreate;
  MetaSignupTicket.findOne = originalFindOne;
  MetaSignupTicket.update = originalUpdate;
});

test("createMetaSignupTicket guarda el hash y no el ticket en claro", async () => {
  configureMeta();
  process.env.BACKEND_PUBLIC_URL = "https://api.example.com/";
  let created;
  MetaSignupTicket.create = async (row) => {
    created = row;
    return row;
  };

  const result = await createMetaSignupTicket("user-1");

  assert.equal(created.userId, "user-1");
  assert.equal(created.status, "pending");
  assert.notEqual(created.ticketHash, result.ticket);
  assert.equal(created.ticketHash, sha256(result.ticket));
  assert.equal(created.ticketHash.length, 64);
  assert.equal(
    result.signupUrl,
    `https://api.example.com/whatsapp-signup?ticket=${encodeURIComponent(result.ticket)}`,
  );
  assert.equal(JSON.stringify(created).includes(result.ticket), false);
});

test("completeMetaSignupTicket canjea con el owner del ticket y no devuelve el token", async () => {
  const ticket = "ticket-plain";
  const row = {
    id: "row-1",
    userId: "owner-9",
    status: "pending",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    errorMessage: null,
    update: async (patch) => {
      Object.assign(row, patch);
    },
  };
  MetaSignupTicket.findOne = async ({ where }) => (where.ticketHash === sha256(ticket) ? row : null);
  MetaSignupTicket.update = async (patch) => {
    if (row.usedAt) return [0];
    Object.assign(row, patch);
    return [1];
  };
  let calls = 0;
  const result = await completeMetaSignupTicket(
    {
      ticket,
      code: "AUTH_CODE",
      wabaId: "waba-1",
      phoneNumberId: "pn-1",
      businessId: "biz-1",
      event: "FINISH",
    },
    {
      completeEmbeddedSignup: async (args) => {
        calls += 1;
        assert.equal(args.ownerUserId, "owner-9");
        assert.equal(args.code, "AUTH_CODE");
        assert.equal(args.wabaId, "waba-1");
        assert.equal(args.phoneNumberId, "pn-1");
        assert.equal(args.businessId, "biz-1");
        assert.equal(args.event, "FINISH");
        return { accessToken: "EAA_SHOULD_NOT_LEAK" };
      },
    },
  );

  assert.equal(calls, 1);
  assert.equal(result.status, "completed");
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(result).includes("EAA_SHOULD_NOT_LEAK"), false);
  assert.equal(JSON.stringify(result).includes("AUTH_CODE"), false);
});

test("el segundo complete no vuelve a canjear", async () => {
  const ticket = "ticket-plain";
  const row = {
    id: "row-1",
    userId: "owner-9",
    status: "pending",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    update: async (patch) => {
      Object.assign(row, patch);
    },
  };
  MetaSignupTicket.findOne = async () => row;
  MetaSignupTicket.update = async (patch) => {
    if (row.usedAt) return [0];
    Object.assign(row, patch);
    return [1];
  };
  let calls = 0;
  const deps = {
    completeEmbeddedSignup: async () => {
      calls += 1;
    },
  };
  const input = { ticket, code: "AUTH_CODE", wabaId: "waba-1", event: "FINISH" };
  await completeMetaSignupTicket(input, deps);
  await assert.rejects(
    () => completeMetaSignupTicket(input, deps),
    (err) => err instanceof ApiError && err.status === 409,
  );
  assert.equal(calls, 1);
});

test("cancel no llama a Graph", async () => {
  const ticket = "ticket-plain";
  const row = {
    id: "row-1",
    userId: "owner-9",
    status: "pending",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    update: async (patch) => {
      Object.assign(row, patch);
    },
  };
  MetaSignupTicket.findOne = async () => row;
  MetaSignupTicket.update = async (patch) => {
    Object.assign(row, patch);
    return [1];
  };

  const result = await completeMetaSignupTicket(
    { ticket, event: "CANCEL" },
    {
      completeEmbeddedSignup: async () => {
        throw new Error("no debe canjear");
      },
    },
  );

  assert.equal(result.status, "cancelled");
  assert.equal(row.status, "cancelled");
});

test("createMetaSignupTicket responde 503 si falta BACKEND_PUBLIC_URL", async () => {
  configureMeta();
  delete process.env.BACKEND_PUBLIC_URL;
  let created = false;
  MetaSignupTicket.create = async () => {
    created = true;
  };

  await assert.rejects(
    () => createMetaSignupTicket("user-1"),
    (err) => err instanceof ApiError && err.status === 503 && err.message === SIGNUP_TICKET_MISSING_URL_MESSAGE,
  );
  assert.equal(created, false);
});
