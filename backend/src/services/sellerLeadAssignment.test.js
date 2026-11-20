import test from "node:test";
import assert from "node:assert/strict";
import { maybeAutoAssignLead, pickSellerForAutoAssign, sellerLeadAssignmentDeps } from "./sellerLeadAssignment.js";

const TZ = "America/Mexico_City";
/** Lunes 2026-04-20 15:00 UTC = 09:00 en Ciudad de México. */
const mondayMorning = new Date("2026-04-20T15:00:00.000Z");

const daySchedule = (start, end) => ({
  monday: [{ start, end }],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
});

const emptySchedule = () => ({
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
});

const seller = (overrides = {}) => ({
  id: "a",
  active: true,
  autoAssignLeads: true,
  weeklySchedule: daySchedule("08:00", "18:00"),
  ...overrides,
});

test("pickSellerForAutoAssign: elige al único vendedor en horario", () => {
  const a = seller({ id: "a", weeklySchedule: daySchedule("08:00", "18:00") });
  const b = seller({ id: "b", weeklySchedule: daySchedule("12:00", "18:00") });
  const picked = pickSellerForAutoAssign([a, b], { now: mondayMorning, timezone: TZ });
  assert.equal(picked.id, "a");
});

test("pickSellerForAutoAssign: si ambos están disponibles, elige al azar", () => {
  const a = seller({ id: "a" });
  const b = seller({ id: "b" });
  assert.equal(
    pickSellerForAutoAssign([a, b], { now: mondayMorning, timezone: TZ, random: () => 0 }).id,
    "a",
  );
  assert.equal(
    pickSellerForAutoAssign([a, b], { now: mondayMorning, timezone: TZ, random: () => 0.99 }).id,
    "b",
  );
});

test("pickSellerForAutoAssign: nadie en horario => null", () => {
  const a = seller({ weeklySchedule: daySchedule("12:00", "18:00") });
  assert.equal(pickSellerForAutoAssign([a], { now: mondayMorning, timezone: TZ }), null);
});

test("pickSellerForAutoAssign: interruptor apagado excluye aunque esté en horario", () => {
  const a = seller({ autoAssignLeads: false });
  assert.equal(pickSellerForAutoAssign([a], { now: mondayMorning, timezone: TZ }), null);
});

test("pickSellerForAutoAssign: vendedor inactivo queda fuera", () => {
  const a = seller({ active: false });
  assert.equal(pickSellerForAutoAssign([a], { now: mondayMorning, timezone: TZ }), null);
});

test("pickSellerForAutoAssign: horario vacío nunca está disponible", () => {
  const a = seller({ weeklySchedule: emptySchedule() });
  assert.equal(pickSellerForAutoAssign([a], { now: mondayMorning, timezone: TZ }), null);
});

test("maybeAutoAssignLead: no pisa un lead que ya tiene vendedor", async () => {
  const lead = {
    assignedSellerUserId: "already",
    update: async () => {
      throw new Error("no debe actualizar un lead ya asignado");
    },
  };
  const result = await maybeAutoAssignLead(lead, { ownerUserId: "owner" });
  assert.equal(result.assignedSellerUserId, "already");
});

test("maybeAutoAssignLead: asigna al vendedor elegido y no hace nada si no hay elegibles", async () => {
  const original = { ...sellerLeadAssignmentDeps };
  const available = seller({ id: "picked" });
  const lead = {
    assignedSellerUserId: null,
    async update(patch) {
      Object.assign(lead, patch);
      return lead;
    },
  };
  sellerLeadAssignmentDeps.getOrCreateBotSettings = async () => ({ timezone: TZ });
  sellerLeadAssignmentDeps.listAssignableSellers = async () => [available];
  try {
    const assigned = await maybeAutoAssignLead(lead, { ownerUserId: "owner", now: mondayMorning });
    assert.equal(assigned.assignedSellerUserId, "picked");
  } finally {
    Object.assign(sellerLeadAssignmentDeps, original);
  }

  const emptyLead = {
    assignedSellerUserId: null,
    async update() {
      throw new Error("no debe asignar si nadie está disponible");
    },
  };
  sellerLeadAssignmentDeps.getOrCreateBotSettings = async () => ({ timezone: TZ });
  sellerLeadAssignmentDeps.listAssignableSellers = async () => [];
  try {
    const untouched = await maybeAutoAssignLead(emptyLead, { ownerUserId: "owner", now: mondayMorning });
    assert.equal(untouched.assignedSellerUserId, null);
  } finally {
    Object.assign(sellerLeadAssignmentDeps, original);
  }
});
