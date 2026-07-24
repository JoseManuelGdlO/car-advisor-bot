import test from "node:test";
import assert from "node:assert/strict";
import { resolveLeadVehicleInterest } from "../services/conversationService.js";
import { Vehicle } from "../models/index.js";

const ownerUserId = "11111111-1111-4111-8111-111111111111";

test("resolveLeadVehicleInterest prioriza selectedVehicleId y usa nombre actual", async () => {
  const originalFindOne = Vehicle.findOne;
  Vehicle.findOne = async () => ({
    id: "veh-1",
    brand: "Suzuki",
    model: "SWIFT BOOSTERGREEN",
    year: 2026,
  });
  try {
    const resolved = await resolveLeadVehicleInterest({
      ownerUserId,
      selectedCar: "Suzuki SWIFT BOOSTERGREEN 2026 2026",
      selectedVehicleId: "veh-1",
    });
    assert.deepEqual(resolved, {
      interestedVehicleId: "veh-1",
      interestedIn: "Suzuki SWIFT BOOSTERGREEN",
    });
  } finally {
    Vehicle.findOne = originalFindOne;
  }
});

test("resolveLeadVehicleInterest empareja texto histórico cuando no hay vehicleId", async () => {
  const originalFindOne = Vehicle.findOne;
  const originalFindAll = Vehicle.findAll;
  Vehicle.findOne = async () => null;
  Vehicle.findAll = async () => [
    { id: "veh-2", brand: "Suzuki", model: "DZIRE BOOSTERGREEN", year: 2026 },
  ];
  try {
    const resolved = await resolveLeadVehicleInterest({
      ownerUserId,
      selectedCar: "Suzuki DZIRE BOOSTERGREEN 2026 2026",
      selectedVehicleId: "",
    });
    assert.deepEqual(resolved, {
      interestedVehicleId: "veh-2",
      interestedIn: "Suzuki DZIRE BOOSTERGREEN",
    });
  } finally {
    Vehicle.findOne = originalFindOne;
    Vehicle.findAll = originalFindAll;
  }
});

test("resolveLeadVehicleInterest sin match no inventa vehicleId (caller no debe sobrescribir)", async () => {
  const originalFindOne = Vehicle.findOne;
  const originalFindAll = Vehicle.findAll;
  Vehicle.findOne = async () => null;
  Vehicle.findAll = async () => [
    { id: "veh-2", brand: "Suzuki", model: "DZIRE BOOSTERGREEN", year: 2026 },
  ];
  try {
    const resolved = await resolveLeadVehicleInterest({
      ownerUserId,
      selectedCar: "Auto desconocido 2020",
      selectedVehicleId: "",
    });
    assert.deepEqual(resolved, {
      interestedVehicleId: null,
      interestedIn: "Auto desconocido 2020",
    });
    // Misma guarda que upsertConversationEvent: no aplicar null sobre un ID previo.
    const leadFieldUpdates = {};
    if (resolved?.interestedVehicleId) {
      leadFieldUpdates.interestedVehicleId = resolved.interestedVehicleId;
    }
    assert.equal(Object.hasOwn(leadFieldUpdates, "interestedVehicleId"), false);
  } finally {
    Vehicle.findOne = originalFindOne;
    Vehicle.findAll = originalFindAll;
  }
});

test("resolveLeadVehicleInterest sin selectedCar ni vehicleId retorna null", async () => {
  const resolved = await resolveLeadVehicleInterest({
    ownerUserId,
    selectedCar: "",
    selectedVehicleId: "",
  });
  assert.equal(resolved, null);
});
