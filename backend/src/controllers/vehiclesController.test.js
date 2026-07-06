import test from "node:test";
import assert from "node:assert/strict";
import { Op } from "sequelize";
import { getVehiclesByFilters, uploadVehicleTechnicalSheet } from "./vehiclesController.js";
import { Vehicle } from "../models/index.js";
import { ApiError } from "../utils/errors.js";

const ownerUserId = "11111111-1111-4111-8111-111111111111";

const createReq = (query = {}) => ({
  auth: { type: "user", userId: ownerUserId },
  query,
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

test("getVehiclesByFilters aplica minPrice y maxPrice", async () => {
  const originalFindAll = Vehicle.findAll;
  let capturedWhere = null;
  Vehicle.findAll = async ({ where }) => {
    capturedWhere = where;
    return [];
  };

  try {
    await getVehiclesByFilters(createReq({ minPrice: "100000", maxPrice: "200000" }), createRes());
    assert.equal(capturedWhere.ownerUserId, ownerUserId);
    assert.equal(capturedWhere.price[Op.gte], 100000);
    assert.equal(capturedWhere.price[Op.lte], 200000);
  } finally {
    Vehicle.findAll = originalFindAll;
  }
});

test("getVehiclesByFilters aplica solo minPrice valido", async () => {
  const originalFindAll = Vehicle.findAll;
  let capturedWhere = null;
  Vehicle.findAll = async ({ where }) => {
    capturedWhere = where;
    return [];
  };

  try {
    await getVehiclesByFilters(createReq({ minPrice: "50000" }), createRes());
    assert.equal(capturedWhere.price[Op.gte], 50000);
    assert.equal(capturedWhere.price[Op.lte], undefined);
  } finally {
    Vehicle.findAll = originalFindAll;
  }
});

test("getVehiclesByFilters ignora precios invalidos", async () => {
  const originalFindAll = Vehicle.findAll;
  let capturedWhere = null;
  Vehicle.findAll = async ({ where }) => {
    capturedWhere = where;
    return [];
  };

  try {
    await getVehiclesByFilters(createReq({ minPrice: "abc", maxPrice: "-10", brand: "Nissan" }), createRes());
    assert.equal(capturedWhere.brand, "Nissan");
    assert.equal(capturedWhere.price, undefined);
  } finally {
    Vehicle.findAll = originalFindAll;
  }
});

test("uploadVehicleTechnicalSheet devuelve URL cuando hay archivo", async () => {
  const res = createRes();
  const next = (err) => {
    throw err;
  };
  await uploadVehicleTechnicalSheet(
    { file: { filename: "test-sheet.pdf" } },
    res,
    next
  );
  assert.equal(res.payload.technicalSheetUrl, "/uploads/autobot/test-sheet.pdf");
});

test("uploadVehicleTechnicalSheet responde 400 sin archivo", async () => {
  let captured = null;
  const next = (err) => {
    captured = err;
  };
  await uploadVehicleTechnicalSheet({ file: null }, createRes(), next);
  assert.ok(captured instanceof ApiError);
  assert.equal(captured.status, 400);
  assert.equal(captured.message, "Se requiere un archivo PDF.");
});
