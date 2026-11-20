import test from "node:test";
import assert from "node:assert/strict";
import { ClientLead } from "../models/index.js";
import { clientsRoutes } from "../routes/clientsRoutes.js";
import {
  deleteClient,
  patchClientSchema,
  resolveCreateClientOutcome,
} from "./clientsController.js";

test("patchClientSchema rechaza status eliminated", () => {
  assert.throws(() =>
    patchClientSchema.parse({
      name: "Ana",
      displayPhone: "5512345678",
      status: "eliminated",
      interestedIn: "",
    }),
  );
});

test("patchClientSchema acepta campos comerciales", () => {
  const payload = patchClientSchema.parse({
    name: "Ana",
    displayPhone: "5512345678",
    status: "negotiation",
    interestedIn: "SUV 2024",
  });
  assert.equal(payload.status, "negotiation");
  assert.equal(payload.displayPhone, "5512345678");
  assert.equal(payload.interestedIn, "SUV 2024");
});

test("resolveCreateClientOutcome creates when no existing row", () => {
  const outcome = resolveCreateClientOutcome(null, { name: "Luis", phone: "5511111111" });
  assert.equal(outcome.kind, "create");
});

test("resolveCreateClientOutcome reactivates eliminated client", () => {
  const existing = {
    status: "eliminated",
    channel: "whatsapp",
    interestedIn: "Auto viejo",
    notes: '{"customer_info":{}}',
    avatarColor: "hsl(142 70% 49%)",
  };
  const outcome = resolveCreateClientOutcome(existing, {
    name: "Luis Nuevo",
    phone: "5511111111",
    channel: "instagram",
    interestedIn: "Sedán",
  });
  assert.equal(outcome.kind, "reactivate");
  assert.equal(outcome.patch.status, "lead");
  assert.equal(outcome.patch.name, "Luis Nuevo");
  assert.equal(outcome.patch.channel, "instagram");
  assert.equal(outcome.patch.interestedIn, "Sedán");
  assert.equal(outcome.patch.displayPhone, "5511111111");
});

test("resolveCreateClientOutcome conflicts when client is visible", () => {
  const outcome = resolveCreateClientOutcome(
    { status: "lead", channel: "web", interestedIn: "", notes: null, avatarColor: null },
    { name: "Luis", phone: "5511111111" },
  );
  assert.equal(outcome.kind, "conflict");
});

// --- DELETE /clients/:id: solo admin (el vendedor no puede borrar leads) ---
const delAdminId = "550e8400-e29b-41d4-a716-446655440000";
const delSellerId = "550e8400-e29b-41d4-a716-446655440001";
const delLeadId = "550e8400-e29b-41d4-a716-446655440009";

const runDelete = async (auth) => {
  const res = { payload: null, json(v) { this.payload = v; } };
  let error;
  await deleteClient({ auth, params: { id: delLeadId } }, res, (e) => { error = e; });
  return { res, error };
};

test("deleteClient: vendedor recibe 403 y no toca la base de datos", async () => {
  const original = ClientLead.findOne;
  let touched = false;
  ClientLead.findOne = async () => { touched = true; return null; };
  try {
    const { error, res } = await runDelete({
      type: "user", userId: delSellerId, role: "seller", tenantOwnerUserId: delAdminId,
    });
    assert.equal(error?.status, 403);
    assert.equal(res.payload, null);
    assert.equal(touched, false);
  } finally {
    ClientLead.findOne = original;
  }
});

test("deleteClient: admin marca el lead como eliminado", async () => {
  const original = ClientLead.findOne;
  const updates = [];
  ClientLead.findOne = async () => ({ id: delLeadId, async update(p) { updates.push(p); } });
  try {
    const { error, res } = await runDelete({
      type: "user", userId: delAdminId, role: "admin", tenantOwnerUserId: delAdminId,
    });
    assert.equal(error, undefined);
    assert.deepEqual(res.payload, { ok: true });
    assert.deepEqual(updates, [{ status: "eliminated" }]);
  } finally {
    ClientLead.findOne = original;
  }
});

test("clientsRoutes: DELETE /clients/:id exige requireAdmin en la ruta", () => {
  const layer = clientsRoutes.stack.find((l) => l.route?.path === "/clients/:id" && l.route.methods.delete);
  assert.ok(layer, "ruta DELETE no encontrada");
  const names = layer.route.stack.map((s) => s.handle.name);
  assert.ok(names.includes("requireAdmin"), `middlewares: ${names.join(",")}`);
});
