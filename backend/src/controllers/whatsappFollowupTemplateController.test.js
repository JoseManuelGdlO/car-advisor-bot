import test from "node:test";
import assert from "node:assert/strict";
import { requireUserAuth } from "../middlewares/auth.js";
import { accountRoutes } from "../routes/accountRoutes.js";
import { ApiError } from "../utils/errors.js";
import {
  getFollowupTemplateHandler,
  postFollowupTemplateHandler,
  putFollowupTemplateHandler,
} from "./whatsappFollowupTemplateController.js";

const OWNER_ID = "owner-1";
const FOLLOWUP_PATH = "/integrations/whatsapp/meta/templates/followup";
const META_REQUIRED_MESSAGE =
  "Conecta WhatsApp con Meta para gestionar la plantilla de seguimiento.";
const PENDING_EDIT_MESSAGE = "No se puede editar una plantilla en revisión";

const mockRes = () => {
  const res = {
    statusCode: null,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      if (this.statusCode == null) this.statusCode = 200;
      this.body = payload;
      return this;
    },
  };
  return res;
};

const throwNext = (err) => {
  if (err) throw err;
};

const serializedTemplate = {
  id: "tpl-1",
  name: "cab_sg_abcd1234",
  displayName: "Seguimiento",
  body: "¿Sigues buscando auto?",
  status: "PENDING",
  rejectedReason: null,
  language: "es_MX",
  category: "MARKETING",
  lastStatusAt: "2026-09-22T00:00:00.000Z",
};

const findRoute = (method) =>
  accountRoutes.stack.find(
    (layer) => layer.route && layer.route.path === FOLLOWUP_PATH && layer.route.methods[method]
  );

test("GET sin Meta responde 200 con metaConnected false y template null", async () => {
  const res = mockRes();
  let calledWith;
  await getFollowupTemplateHandler(
    { auth: { userId: OWNER_ID } },
    res,
    throwNext,
    {
      getFollowupTemplate: async (args) => {
        calledWith = args;
        return { metaConnected: false, template: null };
      },
    }
  );
  assert.deepEqual(calledWith, { ownerUserId: OWNER_ID });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { metaConnected: false, template: null });
});

test("POST sin Meta pasa 400 con el mensaje del servicio", async () => {
  const res = mockRes();
  const err = new ApiError(400, META_REQUIRED_MESSAGE);
  await assert.rejects(
    () =>
      postFollowupTemplateHandler(
        { auth: { userId: OWNER_ID }, body: { body: "Hola" } },
        res,
        throwNext,
        {
          createFollowupTemplate: async () => {
            throw err;
          },
        }
      ),
    (caught) =>
      caught === err &&
      caught.status === 400 &&
      caught.message === META_REQUIRED_MESSAGE
  );
  assert.equal(res.body, undefined);
});

test("POST { body } delega en createFollowupTemplate y responde 201 con el DTO", async () => {
  const res = mockRes();
  let calledWith;
  await postFollowupTemplateHandler(
    { auth: { userId: OWNER_ID }, body: { body: "¿Sigues buscando auto?" } },
    res,
    throwNext,
    {
      createFollowupTemplate: async (args) => {
        calledWith = args;
        return serializedTemplate;
      },
    }
  );
  assert.deepEqual(calledWith, { ownerUserId: OWNER_ID, body: "¿Sigues buscando auto?" });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body, serializedTemplate);
});

test("PUT 409 si el servicio lanza plantilla en revisión", async () => {
  const res = mockRes();
  const err = new ApiError(409, PENDING_EDIT_MESSAGE);
  await assert.rejects(
    () =>
      putFollowupTemplateHandler(
        { auth: { userId: OWNER_ID }, body: { body: "Texto nuevo" } },
        res,
        throwNext,
        {
          updateFollowupTemplate: async () => {
            throw err;
          },
        }
      ),
    (caught) =>
      caught === err && caught.status === 409 && caught.message === PENDING_EDIT_MESSAGE
  );
  assert.equal(res.body, undefined);
});

test("PUT delega en updateFollowupTemplate y responde 200 con el DTO", async () => {
  const res = mockRes();
  const dto = { ...serializedTemplate, status: "APPROVED", body: "Texto nuevo" };
  let calledWith;
  await putFollowupTemplateHandler(
    { auth: { userId: OWNER_ID }, body: { body: "Texto nuevo" } },
    res,
    throwNext,
    {
      updateFollowupTemplate: async (args) => {
        calledWith = args;
        return dto;
      },
    }
  );
  assert.deepEqual(calledWith, { ownerUserId: OWNER_ID, body: "Texto nuevo" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, dto);
});

test("accountRoutes monta GET/POST/PUT followup detrás de requireUserAuth", () => {
  for (const method of ["get", "post", "put"]) {
    const layer = findRoute(method);
    assert.ok(layer, `falta ${method.toUpperCase()} ${FOLLOWUP_PATH}`);
    assert.equal(layer.route.stack[0].handle, requireUserAuth);
  }
});
