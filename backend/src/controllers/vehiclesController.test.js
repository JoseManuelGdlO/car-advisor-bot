import test from "node:test";
import assert from "node:assert/strict";
import { Op } from "sequelize";
import {
  getVehiclesByFilters,
  parseVehicleTechnicalSheet,
  technicalSheetParseDeps,
  uploadVehicleTechnicalSheet,
} from "./vehiclesController.js";
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

test("parseVehicleTechnicalSheet responde 422 cuando el PDF no tiene texto", async () => {
  const originalExtract = technicalSheetParseDeps.extractPdfText;
  technicalSheetParseDeps.extractPdfText = async () => "   ";
  let captured = null;
  try {
    await parseVehicleTechnicalSheet(
      { file: { buffer: Buffer.from("pdf") } },
      createRes(),
      (err) => {
        captured = err;
      }
    );
  } finally {
    technicalSheetParseDeps.extractPdfText = originalExtract;
  }
  assert.ok(captured instanceof ApiError);
  assert.equal(captured.status, 422);
  assert.match(captured.message, /escaneado/);
});

test("parseVehicleTechnicalSheet normaliza la respuesta del bot", async () => {
  const originalExtract = technicalSheetParseDeps.extractPdfText;
  const originalParse = technicalSheetParseDeps.parseVehicleSheet;
  technicalSheetParseDeps.extractPdfText = async () => "Marca Nissan";
  technicalSheetParseDeps.parseVehicleSheet = async () => ({
    brand: "N".repeat(90),
    model: "Versa",
    year: 2024,
    price: 0,
    km: null,
    transmission: "CVT",
    engine: "1.6L",
    color: "Gris",
  });
  const res = createRes();
  try {
    await parseVehicleTechnicalSheet({ file: { buffer: Buffer.from("pdf") } }, res, (err) => {
      throw err;
    });
  } finally {
    technicalSheetParseDeps.extractPdfText = originalExtract;
    technicalSheetParseDeps.parseVehicleSheet = originalParse;
  }
  assert.equal(res.payload.brand.length, 80);
  assert.equal(res.payload.model, "Versa");
  assert.equal(res.payload.price, null);
  assert.equal(res.payload.km, 0);
});
