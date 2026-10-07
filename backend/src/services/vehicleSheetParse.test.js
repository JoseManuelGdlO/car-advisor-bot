import test from "node:test";
import assert from "node:assert/strict";
import { extractPdfText, normalizeVehicleSheet } from "./vehicleSheetParse.js";

test("normalizeVehicleSheet recorta textos y deja el precio vacío si es 0 o null", () => {
  const longBrand = "N".repeat(90);
  const parsed = normalizeVehicleSheet({
    brand: longBrand,
    model: " Versa ",
    year: "2024",
    price: 0,
    km: null,
    transmission: "T".repeat(50),
    engine: "1.6L",
    color: "Gris",
    description: " Sedán ",
    metadata: { passengers: 5, version: " Advance " },
  });

  assert.equal(parsed.brand.length, 80);
  assert.equal(parsed.model, "Versa");
  assert.equal(parsed.year, 2024);
  assert.equal(parsed.price, null);
  assert.equal(parsed.km, 0);
  assert.equal(parsed.transmission.length, 40);
  assert.equal(parsed.description, "Sedán");
  assert.deepEqual(parsed.metadata, { passengers: 5, version: "Advance" });

  assert.equal(normalizeVehicleSheet({ price: null }).price, null);
  assert.equal(normalizeVehicleSheet({ price: 629900 }).price, 629900);
});

test("extractPdfText lee un Buffer de multer, no solo Uint8Array", async () => {
  const pdf = Buffer.from(
    "%PDF-1.4\n" +
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
      "2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
      "4 0 obj<</Length 48>>stream\n" +
      "BT /F1 18 Tf 20 80 Td (Ertiga XL7 2026) Tj ET\n" +
      "endstream\nendobj\n" +
      "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n" +
      "trailer<</Root 1 0 R>>\n" +
      "%%EOF\n"
  );

  const text = await extractPdfText(pdf);
  assert.match(text, /Ertiga XL7 2026/);
});
