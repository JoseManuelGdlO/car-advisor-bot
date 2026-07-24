import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTopProductsRanking,
  formatVehicleDisplayName,
  matchInterestToVehicle,
  normalizeInterestedInLabel,
  buildVehicleMatchIndex,
} from "../utils/dashboardTopProducts.js";
import { findInterestLeads, getTopProducts } from "./dashboardController.js";
import { ClientLead, Vehicle } from "../models/index.js";
import { Op } from "sequelize";

const ownerUserId = "11111111-1111-4111-8111-111111111111";

const createReq = () => ({
  auth: { type: "user", userId: ownerUserId },
});

const createRes = () => {
  const response = {
    payload: null,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.payload = value;
      return value;
    },
  };
  return response;
};

test("normalizeInterestedInLabel elimina años finales duplicados", () => {
  assert.equal(
    normalizeInterestedInLabel("Suzuki SWIFT BOOSTERGREEN 2026 2026"),
    "Suzuki SWIFT BOOSTERGREEN 2026",
  );
  assert.equal(normalizeInterestedInLabel("  Honda   Civic  2023 "), "Honda Civic 2023");
});

test("formatVehicleDisplayName usa marca y modelo sin año", () => {
  assert.equal(
    formatVehicleDisplayName({ brand: "Suzuki", model: "SWIFT BOOSTERGREEN", year: 2026 }),
    "Suzuki SWIFT BOOSTERGREEN",
  );
});

test("matchInterestToVehicle agrupa variantes históricas al catálogo actual", () => {
  const vehicles = [
    { id: "v1", brand: "Suzuki", model: "SWIFT BOOSTERGREEN", year: 2026 },
    { id: "v2", brand: "Suzuki", model: "DZIRE BOOSTERGREEN", year: 2026 },
  ];
  const index = buildVehicleMatchIndex(vehicles);
  assert.equal(matchInterestToVehicle("Suzuki SWIFT BOOSTERGREEN 2026 2026", index)?.id, "v1");
  assert.equal(matchInterestToVehicle("Suzuki SWIFT BOOSTERGREEN 2026", index)?.id, "v1");
  assert.equal(matchInterestToVehicle("Suzuki SWIFT BOOSTERGREEN", index)?.id, "v1");
});

test("buildTopProductsRanking agrupa textos duplicados y prioriza vehicleId", () => {
  const vehicles = [
    { id: "v-swift", brand: "Suzuki", model: "SWIFT BOOSTERGREEN", year: 2026 },
    { id: "v-dzire", brand: "Suzuki", model: "DZIRE BOOSTERGREEN", year: 2026 },
    { id: "v-fronx", brand: "Suzuki", model: "FRONX BOOSTERGREEN", year: 2026 },
  ];
  const leads = [
    { interestedIn: "Suzuki SWIFT BOOSTERGREEN 2026 2026", interestedVehicleId: null },
    { interestedIn: "Suzuki SWIFT BOOSTERGREEN 2026", interestedVehicleId: null },
    { interestedIn: "viejo", interestedVehicleId: "v-swift" },
    { interestedIn: "Suzuki DZIRE BOOSTERGREEN 2026 2026", interestedVehicleId: null },
  ];
  const ranking = buildTopProductsRanking({ leads, vehicles, includeZero: true });
  assert.deepEqual(ranking, [
    { name: "Suzuki SWIFT BOOSTERGREEN", queries: 3 },
    { name: "Suzuki DZIRE BOOSTERGREEN", queries: 1 },
    { name: "Suzuki FRONX BOOSTERGREEN", queries: 0 },
  ]);
});

test("buildTopProductsRanking limita top sin incluir ceros", () => {
  const ranking = buildTopProductsRanking({
    leads: [
      { interestedIn: "A", interestedVehicleId: null },
      { interestedIn: "B", interestedVehicleId: null },
      { interestedIn: "A", interestedVehicleId: null },
    ],
    vehicles: [{ id: "v1", brand: "C", model: "Model", year: 2020 }],
    limit: 1,
    includeZero: false,
  });
  assert.deepEqual(ranking, [{ name: "A", queries: 2 }]);
});

test("findInterestLeads filtra por propietario y excluye eliminated", async () => {
  const originalFindAll = ClientLead.findAll;
  let captured = null;
  ClientLead.findAll = async (query) => {
    captured = query;
    return [];
  };
  try {
    await findInterestLeads(ownerUserId);
    assert.equal(captured.where.ownerUserId, ownerUserId);
    assert.deepEqual(captured.where.status, { [Op.ne]: "eliminated" });
    assert.deepEqual(captured.attributes, ["interestedIn", "interestedVehicleId"]);
  } finally {
    ClientLead.findAll = originalFindAll;
  }
});

test("getTopProducts responde ranking resuelto al catálogo actual", async () => {
  const originalLeadFindAll = ClientLead.findAll;
  const originalVehicleFindAll = Vehicle.findAll;
  ClientLead.findAll = async () => [
    { interestedIn: "Suzuki SWIFT BOOSTERGREEN 2026 2026", interestedVehicleId: null },
    { interestedIn: "Suzuki SWIFT BOOSTERGREEN 2026", interestedVehicleId: null },
  ];
  Vehicle.findAll = async () => [
    { id: "v1", brand: "Suzuki", model: "SWIFT BOOSTERGREEN", year: 2026 },
    { id: "v2", brand: "Suzuki", model: "DZIRE BOOSTERGREEN", year: 2026 },
  ];

  try {
    const res = createRes();
    await getTopProducts(createReq(), res);
    assert.deepEqual(res.payload.items, [
      { name: "Suzuki SWIFT BOOSTERGREEN", queries: 2 },
      { name: "Suzuki DZIRE BOOSTERGREEN", queries: 0 },
    ]);
  } finally {
    ClientLead.findAll = originalLeadFindAll;
    Vehicle.findAll = originalVehicleFindAll;
  }
});
