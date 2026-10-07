import test from "node:test";
import assert from "node:assert/strict";
import { BotSetting, WhatsappMessageTemplate } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import {
  META_FOLLOWUP_DEFAULT_BODY,
  META_FOLLOWUP_DISPLAY_NAME,
  TEMPLATE_CATEGORY,
  TEMPLATE_LANGUAGE,
  TEMPLATE_PURPOSE_FOLLOWUP,
  bodyTextFromComponents,
} from "../utils/whatsappTemplateBody.js";
import {
  applyTemplateStatusUpdate,
  createFollowupTemplate,
  ensureFollowupDefaultTemplate,
  isDuplicateNameError,
  isFollowupTemplateApproved,
  mapTemplateStatusEvent,
  getFollowupTemplate,
  serializeFollowupTemplate,
  updateFollowupTemplate,
} from "./whatsappFollowupTemplateService.js";

const OWNER_ID = "owner-1";
const WABA_ID = "waba-1";
const DEALER_TOKEN = "dealer-access-token";

function makeRow(overrides = {}) {
  const row = {
    id: "tpl-1",
    ownerUserId: OWNER_ID,
    wabaId: WABA_ID,
    metaTemplateId: "meta-tpl-1",
    name: "cab_sg_abcd1234",
    displayName: META_FOLLOWUP_DISPLAY_NAME,
    language: TEMPLATE_LANGUAGE,
    category: TEMPLATE_CATEGORY,
    components: [{ type: "BODY", text: "Hola, ¿sigues interesado?" }],
    status: "APPROVED",
    rejectedReason: null,
    lastStatusAt: new Date("2026-01-01T00:00:00.000Z"),
    purpose: TEMPLATE_PURPOSE_FOLLOWUP,
    isWabaDefault: false,
    update: async (fields) => {
      Object.assign(row, fields);
      return row;
    },
    ...overrides,
  };
  if (overrides.update) row.update = overrides.update;
  return row;
}

function stubMethod(target, method, impl) {
  const original = target[method];
  target[method] = impl;
  return () => {
    target[method] = original;
  };
}

const connectedIntegration = {
  findActiveIntegration: async () => ({ id: "int-1", wabaId: WABA_ID }),
  resolveIntegration: async () => ({
    integration: { id: "int-1", wabaId: WABA_ID },
    credentials: { accessToken: DEALER_TOKEN, wabaId: WABA_ID },
  }),
};

test("mapTemplateStatusEvent mapea approved, FLAGGED y desconocidos", () => {
  assert.equal(mapTemplateStatusEvent("approved"), "APPROVED");
  assert.equal(mapTemplateStatusEvent("FLAGGED"), "PAUSED");
  assert.equal(mapTemplateStatusEvent("paused"), "PAUSED");
  assert.equal(mapTemplateStatusEvent("unknown"), null);
  assert.equal(mapTemplateStatusEvent(""), null);
});

test("isFollowupTemplateApproved solo es true con APPROVED", () => {
  assert.equal(isFollowupTemplateApproved({ status: "APPROVED" }), true);
  assert.equal(isFollowupTemplateApproved({ status: "PENDING" }), false);
  assert.equal(isFollowupTemplateApproved({ status: "REJECTED" }), false);
  assert.equal(isFollowupTemplateApproved(null), false);
});

test("isDuplicateNameError detecta colisión de nombre de Graph", () => {
  assert.equal(isDuplicateNameError(new Error("Template name already exists")), true);
  assert.equal(isDuplicateNameError({ message: "duplicate" }), true);
  assert.equal(isDuplicateNameError({ meta: { message: "name collision" } }), true);
  assert.equal(isDuplicateNameError({ meta: { code: "unique" } }), true);
  assert.equal(isDuplicateNameError(new Error("rate limited")), false);
});

test("getFollowupTemplate indica metaConnected false sin integración", async () => {
  const result = await getFollowupTemplate({
    ownerUserId: OWNER_ID,
    findActiveIntegration: async () => null,
  });
  assert.deepEqual(result, { metaConnected: false, template: null });
});

test("getFollowupTemplate consulta Graph si la fila sigue PENDING", async () => {
  const row = makeRow({ status: "PENDING" });
  const restore = stubMethod(WhatsappMessageTemplate, "findAll", async () => [row]);

  try {
    const result = await getFollowupTemplate({
      ownerUserId: OWNER_ID,
      findActiveIntegration: async () => ({ id: "int-1", wabaId: WABA_ID }),
      resolveIntegration: async () => ({ credentials: { accessToken: DEALER_TOKEN } }),
      getTemplateOnMeta: async ({ templateId, token }) => {
        assert.equal(templateId, "meta-tpl-1");
        assert.equal(token, DEALER_TOKEN);
        return { id: templateId, status: "APPROVED" };
      },
    });
    assert.equal(row.status, "APPROVED");
    assert.equal(result.template.status, "APPROVED");
  } finally {
    restore();
  }
});

test("getFollowupTemplate serializa la plantilla activa del WABA", async () => {
  const approved = makeRow({ status: "APPROVED" });
  const restore = stubMethod(WhatsappMessageTemplate, "findAll", async () => [
    makeRow({ id: "rej", status: "REJECTED" }),
    approved,
  ]);

  try {
    const result = await getFollowupTemplate({
      ownerUserId: OWNER_ID,
      findActiveIntegration: async () => ({ id: "int-1", wabaId: WABA_ID }),
    });
    assert.equal(result.metaConnected, true);
    assert.deepEqual(result.template, serializeFollowupTemplate(approved));
  } finally {
    restore();
  }
});

test("serializeFollowupTemplate expone body vía bodyTextFromComponents", () => {
  const row = makeRow({
    components: [{ type: "BODY", text: "  Texto del cuerpo  " }, { type: "FOOTER", text: "no" }],
    rejectedReason: "calidad",
  });
  const dto = serializeFollowupTemplate(row);
  assert.equal(dto.body, bodyTextFromComponents(row.components));
  assert.equal(dto.body, "Texto del cuerpo");
  assert.equal(dto.id, row.id);
  assert.equal(dto.name, row.name);
  assert.equal(dto.displayName, row.displayName);
  assert.equal(dto.status, row.status);
  assert.equal(dto.rejectedReason, "calidad");
  assert.equal(dto.language, TEMPLATE_LANGUAGE);
  assert.equal(dto.category, TEMPLATE_CATEGORY);
  assert.equal(dto.lastStatusAt, row.lastStatusAt);
  assert.equal(serializeFollowupTemplate(null), null);
});

test("applyTemplateStatusUpdate actualiza status y limpia rejectedReason si no es REJECTED", async () => {
  const row = makeRow({ status: "PENDING", rejectedReason: "viejo" });
  let capturedWhere = null;
  const restore = stubMethod(WhatsappMessageTemplate, "findOne", async ({ where }) => {
    capturedWhere = where;
    return row;
  });

  try {
    const result = await applyTemplateStatusUpdate({
      event: "approved",
      metaTemplateId: "meta-tpl-1",
      reason: "no aplica",
    });
    assert.deepEqual(capturedWhere, { metaTemplateId: "meta-tpl-1" });
    assert.equal(row.status, "APPROVED");
    assert.equal(row.rejectedReason, null);
    assert.ok(row.lastStatusAt instanceof Date);
    assert.equal(result.processed, true);
    assert.equal(result.reason, "template_status_updated");
    assert.equal(result.status, "APPROVED");
  } finally {
    restore();
  }
});

test("applyTemplateStatusUpdate guarda rejectedReason en REJECTED y busca por wabaId+name", async () => {
  const row = makeRow({ status: "PENDING" });
  let capturedWhere = null;
  const restore = stubMethod(WhatsappMessageTemplate, "findOne", async ({ where }) => {
    capturedWhere = where;
    return row;
  });

  try {
    await applyTemplateStatusUpdate({
      event: "REJECTED",
      wabaId: WABA_ID,
      name: "cab_sg_abcd1234",
      reason: "contenido promocional",
    });
    assert.deepEqual(capturedWhere, { wabaId: WABA_ID, name: "cab_sg_abcd1234" });
    assert.equal(row.status, "REJECTED");
    assert.equal(row.rejectedReason, "contenido promocional");
  } finally {
    restore();
  }
});

test("applyTemplateStatusUpdate mapea FLAGGED a PAUSED", async () => {
  const row = makeRow({ status: "APPROVED", rejectedReason: "x" });
  const restore = stubMethod(WhatsappMessageTemplate, "findOne", async () => row);

  try {
    const result = await applyTemplateStatusUpdate({ event: "FLAGGED", metaTemplateId: "meta-tpl-1" });
    assert.equal(row.status, "PAUSED");
    assert.equal(row.rejectedReason, null);
    assert.equal(result.status, "PAUSED");
  } finally {
    restore();
  }
});

test("applyTemplateStatusUpdate no lanza si la plantilla es desconocida", async () => {
  const restore = stubMethod(WhatsappMessageTemplate, "findOne", async () => null);

  try {
    const result = await applyTemplateStatusUpdate({ event: "APPROVED", metaTemplateId: "missing" });
    assert.deepEqual(result, { processed: true, reason: "unknown_template" });
  } finally {
    restore();
  }
});

test("ensureFollowupDefaultTemplate no crea si la fila local ya tiene id y el WABA no lista otra", async () => {
  const existing = makeRow({ status: "PENDING", isWabaDefault: true });
  const restore = stubMethod(WhatsappMessageTemplate, "findAll", async () => [existing]);
  let createCalls = 0;
  let listCalls = 0;

  try {
    const result = await ensureFollowupDefaultTemplate({
      ownerUserId: OWNER_ID,
      wabaId: WABA_ID,
      accessToken: DEALER_TOKEN,
      listOnMeta: async () => {
        listCalls += 1;
        return [];
      },
      createOnMeta: async () => {
        createCalls += 1;
        return { id: "should-not-run" };
      },
    });
    assert.equal(result.created, false);
    assert.equal(result.template, existing);
    assert.equal(listCalls, 1);
    assert.equal(createCalls, 0);
  } finally {
    restore();
  }
});

test("ensureFollowupDefaultTemplate reutiliza la plantilla de seguimiento que ya está en el WABA", async () => {
  const restores = [
    stubMethod(WhatsappMessageTemplate, "findAll", async () => []),
    stubMethod(WhatsappMessageTemplate, "findOne", async () => null),
    stubMethod(BotSetting, "findOne", async () => null),
  ];
  let created = null;
  restores.push(
    stubMethod(WhatsappMessageTemplate, "create", async (payload) => {
      created = makeRow(payload);
      return created;
    }),
  );
  let createCalls = 0;

  try {
    const result = await ensureFollowupDefaultTemplate({
      ownerUserId: OWNER_ID,
      wabaId: WABA_ID,
      accessToken: DEALER_TOKEN,
      listOnMeta: async ({ wabaId, token }) => {
        assert.equal(wabaId, WABA_ID);
        assert.equal(token, DEALER_TOKEN);
        return [
          {
            id: "meta-existing",
            name: "cab_sg_deadbeef",
            status: "APPROVED",
            language: TEMPLATE_LANGUAGE,
            category: TEMPLATE_CATEGORY,
            components: [{ type: "BODY", text: "Hola, seguimos en contacto." }],
          },
        ];
      },
      createOnMeta: async () => {
        createCalls += 1;
        return { id: "should-not-run" };
      },
    });
    assert.equal(createCalls, 0);
    assert.equal(result.created, false);
    assert.equal(result.reused, true);
    assert.equal(created.metaTemplateId, "meta-existing");
    assert.equal(created.name, "cab_sg_deadbeef");
    assert.equal(created.status, "APPROVED");
    assert.equal(created.purpose, TEMPLATE_PURPOSE_FOLLOWUP);
  } finally {
    restores.forEach((restore) => restore());
  }
});

test("ensureFollowupDefaultTemplate lanza si no hay fila local y listar el WABA falla", async () => {
  const restore = stubMethod(WhatsappMessageTemplate, "findAll", async () => []);
  try {
    await assert.rejects(
      () =>
        ensureFollowupDefaultTemplate({
          ownerUserId: OWNER_ID,
          wabaId: WABA_ID,
          accessToken: DEALER_TOKEN,
          listOnMeta: async () => {
            throw new ApiError(502, "No se pudo contactar la API de Meta.");
          },
          createOnMeta: async () => ({ id: "should-not-run" }),
        }),
      (err) => err instanceof ApiError && err.status === 502,
    );
  } finally {
    restore();
  }
});

test("ensureFollowupDefaultTemplate crea default PENDING isWabaDefault purpose=followup", async () => {
  const restores = [
    stubMethod(WhatsappMessageTemplate, "findAll", async () => []),
    stubMethod(BotSetting, "findOne", async () => null),
  ];
  let created = null;
  restores.push(
    stubMethod(WhatsappMessageTemplate, "create", async (payload) => {
      created = makeRow(payload);
      return created;
    })
  );
  let graphPayload = null;

  try {
    const result = await ensureFollowupDefaultTemplate({
      ownerUserId: OWNER_ID,
      wabaId: WABA_ID,
      accessToken: DEALER_TOKEN,
      listOnMeta: async () => [],
      createOnMeta: async ({ wabaId, token, payload }) => {
        assert.equal(wabaId, WABA_ID);
        assert.equal(token, DEALER_TOKEN);
        graphPayload = payload;
        return { id: "meta-new" };
      },
    });
    assert.equal(result.created, true);
    assert.match(graphPayload.name, /^cab_sg_[0-9a-f]{8}$/);
    assert.equal(graphPayload.language, TEMPLATE_LANGUAGE);
    assert.equal(graphPayload.category, TEMPLATE_CATEGORY);
    assert.deepEqual(graphPayload.components, [{ type: "BODY", text: META_FOLLOWUP_DEFAULT_BODY }]);
    assert.equal(created.status, "PENDING");
    assert.equal(created.isWabaDefault, true);
    assert.equal(created.purpose, TEMPLATE_PURPOSE_FOLLOWUP);
    assert.equal(created.displayName, META_FOLLOWUP_DISPLAY_NAME);
    assert.equal(created.metaTemplateId, "meta-new");
    assert.equal(created.ownerUserId, OWNER_ID);
  } finally {
    restores.forEach((restore) => restore());
  }
});

test("ensureFollowupDefaultTemplate reintenta con otro name si Graph reporta duplicado", async () => {
  const restores = [
    stubMethod(WhatsappMessageTemplate, "findAll", async () => []),
    stubMethod(BotSetting, "findOne", async () => null),
    stubMethod(WhatsappMessageTemplate, "create", async (payload) => makeRow(payload)),
  ];
  const names = [];

  try {
    await ensureFollowupDefaultTemplate({
      ownerUserId: OWNER_ID,
      wabaId: WABA_ID,
      accessToken: DEALER_TOKEN,
      listOnMeta: async () => [],
      createOnMeta: async ({ payload }) => {
        names.push(payload.name);
        if (names.length === 1) {
          throw new ApiError(400, "Template name already exists");
        }
        return { id: "meta-retry" };
      },
    });
    assert.equal(names.length, 2);
    assert.notEqual(names[0], names[1]);
    assert.match(names[0], /^cab_sg_[0-9a-f]{8}$/);
    assert.match(names[1], /^cab_sg_[0-9a-f]{8}$/);
  } finally {
    restores.forEach((restore) => restore());
  }
});

test("createFollowupTemplate 409 si existe una plantilla activa", async () => {
  const restore = stubMethod(WhatsappMessageTemplate, "findAll", async () => [makeRow({ status: "APPROVED" })]);
  let graphCalls = 0;

  try {
    await assert.rejects(
      () =>
        createFollowupTemplate({
          ownerUserId: OWNER_ID,
          body: "Hola de nuevo",
          createOnMeta: async () => {
            graphCalls += 1;
            return { id: "x" };
          },
          ...connectedIntegration,
        }),
      (err) => err instanceof ApiError && err.status === 409 && /activa/i.test(err.message)
    );
    assert.equal(graphCalls, 0);
  } finally {
    restore();
  }
});

test("createFollowupTemplate 400 si no hay integración Meta", async () => {
  await assert.rejects(
    () =>
      createFollowupTemplate({
        ownerUserId: OWNER_ID,
        body: "Hola",
        findActiveIntegration: async () => null,
        createOnMeta: async () => ({ id: "x" }),
      }),
    (err) =>
      err instanceof ApiError &&
      err.status === 400 &&
      /whatsapp/i.test(err.message) &&
      /meta/i.test(err.message)
  );
});

test("createFollowupTemplate crea fila nueva si solo hay REJECTED", async () => {
  const restores = [
    stubMethod(WhatsappMessageTemplate, "findAll", async () => [makeRow({ status: "REJECTED", name: "cab_sg_oldold01" })]),
    stubMethod(BotSetting, "findOne", async () => null),
  ];
  let created = null;
  restores.push(
    stubMethod(WhatsappMessageTemplate, "create", async (payload) => {
      created = makeRow(payload);
      return created;
    })
  );

  try {
    await createFollowupTemplate({
      ownerUserId: OWNER_ID,
      body: "Nuevo cuerpo de seguimiento",
      createOnMeta: async ({ payload }) => {
        assert.notEqual(payload.name, "cab_sg_oldold01");
        assert.deepEqual(payload.components, [{ type: "BODY", text: "Nuevo cuerpo de seguimiento" }]);
        return { id: "meta-fresh" };
      },
      ...connectedIntegration,
    });
    assert.equal(created.status, "PENDING");
    assert.equal(created.isWabaDefault, false);
    assert.equal(created.metaTemplateId, "meta-fresh");
    assert.notEqual(created.name, "cab_sg_oldold01");
  } finally {
    restores.forEach((restore) => restore());
  }
});

test("updateFollowupTemplate 409 si está PENDING", async () => {
  const restore = stubMethod(WhatsappMessageTemplate, "findAll", async () => [makeRow({ status: "PENDING" })]);
  let graphCalls = 0;

  try {
    await assert.rejects(
      () =>
        updateFollowupTemplate({
          ownerUserId: OWNER_ID,
          body: "Otro texto",
          updateOnMeta: async () => {
            graphCalls += 1;
          },
          ...connectedIntegration,
        }),
      (err) =>
        err instanceof ApiError &&
        err.status === 409 &&
        /no se puede editar una plantilla en revisión/i.test(err.message)
    );
    assert.equal(graphCalls, 0);
  } finally {
    restore();
  }
});

test("updateFollowupTemplate 404 si no hay fila", async () => {
  const restore = stubMethod(WhatsappMessageTemplate, "findAll", async () => []);

  try {
    await assert.rejects(
      () =>
        updateFollowupTemplate({
          ownerUserId: OWNER_ID,
          body: "Texto",
          ...connectedIntegration,
        }),
      (err) => err instanceof ApiError && err.status === 404
    );
  } finally {
    restore();
  }
});

test("updateFollowupTemplate con APPROVED actualiza Graph y deja PENDING", async () => {
  const row = makeRow({ status: "APPROVED" });
  const restore = stubMethod(WhatsappMessageTemplate, "findAll", async () => [row]);
  const restoreBot = stubMethod(BotSetting, "findOne", async () => null);
  let graphCall = null;

  try {
    await updateFollowupTemplate({
      ownerUserId: OWNER_ID,
      body: "Cuerpo editado para revisión",
      updateOnMeta: async (args) => {
        graphCall = args;
      },
      ...connectedIntegration,
    });
    assert.equal(graphCall.templateId, "meta-tpl-1");
    assert.equal(graphCall.token, DEALER_TOKEN);
    assert.deepEqual(graphCall.payload.components, [{ type: "BODY", text: "Cuerpo editado para revisión" }]);
    assert.equal(graphCall.payload.language, TEMPLATE_LANGUAGE);
    assert.equal(graphCall.payload.category, TEMPLATE_CATEGORY);
    assert.equal(row.status, "PENDING");
    assert.equal(row.rejectedReason, null);
    assert.ok(row.lastStatusAt instanceof Date);
  } finally {
    restore();
    restoreBot();
  }
});

test("tras create y update copia el cuerpo a BotSetting.reminderMessage si existe", async () => {
  const botSetting = {
    reminderMessage: "viejo",
    update: async (fields) => {
      Object.assign(botSetting, fields);
    },
  };
  const restores = [
    stubMethod(WhatsappMessageTemplate, "findAll", async () => []),
    stubMethod(BotSetting, "findOne", async () => botSetting),
    stubMethod(WhatsappMessageTemplate, "create", async (payload) => makeRow(payload)),
  ];

  try {
    await createFollowupTemplate({
      ownerUserId: OWNER_ID,
      body: "Cuerpo creado",
      createOnMeta: async () => ({ id: "meta-c" }),
      ...connectedIntegration,
    });
    assert.equal(botSetting.reminderMessage, "Cuerpo creado");

    const approved = makeRow({ status: "APPROVED" });
    restores[0]();
    restores[0] = stubMethod(WhatsappMessageTemplate, "findAll", async () => [approved]);
    await updateFollowupTemplate({
      ownerUserId: OWNER_ID,
      body: "Cuerpo actualizado",
      updateOnMeta: async () => ({}),
      ...connectedIntegration,
    });
    assert.equal(botSetting.reminderMessage, "Cuerpo actualizado");
  } finally {
    restores.forEach((restore) => restore());
  }
});

test("no crea BotSetting vacío al sincronizar reminderMessage", async () => {
  let botCreateCalled = false;
  const restores = [
    stubMethod(WhatsappMessageTemplate, "findAll", async () => []),
    stubMethod(BotSetting, "findOne", async () => null),
    stubMethod(BotSetting, "create", async () => {
      botCreateCalled = true;
      return {};
    }),
    stubMethod(WhatsappMessageTemplate, "create", async (payload) => makeRow(payload)),
  ];

  try {
    await createFollowupTemplate({
      ownerUserId: OWNER_ID,
      body: "Sin settings",
      createOnMeta: async () => ({ id: "meta-c" }),
      ...connectedIntegration,
    });
    assert.equal(botCreateCalled, false);
  } finally {
    restores.forEach((restore) => restore());
  }
});
