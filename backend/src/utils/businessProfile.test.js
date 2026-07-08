import test from "node:test";
import assert from "node:assert/strict";

import { toBusinessProfileBotDto, toBusinessProfileDto } from "./businessProfile.js";

test("toBusinessProfileDto maps row fields", () => {
  const dto = toBusinessProfileDto({
    tradeName: "Lote Sur",
    legalName: "Lote Sur SA",
    taxId: "RFC123",
    businessPhone: "+521234567890",
    businessEmail: "ventas@lote.mx",
    website: "https://lote.mx",
    addressLine: "Calle 1",
    city: "Guadalajara",
    state: "Jalisco",
    country: "Mexico",
    description: "Autos seminuevos",
    logoUrl: "https://cdn/logo.png",
  });
  assert.equal(dto.tradeName, "Lote Sur");
  assert.equal(dto.city, "Guadalajara");
  assert.equal(dto.description, "Autos seminuevos");
});

test("toBusinessProfileDto returns null for missing row", () => {
  assert.equal(toBusinessProfileDto(null), null);
});

test("toBusinessProfileBotDto omits fiscal and legal fields", () => {
  const dto = toBusinessProfileBotDto({
    tradeName: "Lote Sur",
    legalName: "Lote Sur SA",
    taxId: "RFC123",
    businessPhone: "+521234567890",
  });
  assert.equal(dto.tradeName, "Lote Sur");
  assert.equal(dto.businessPhone, "+521234567890");
  assert.equal(dto.legalName, undefined);
  assert.equal(dto.taxId, undefined);
});
