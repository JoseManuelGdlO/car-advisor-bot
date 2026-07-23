import test from "node:test";
import assert from "node:assert/strict";
import { buildNotesWithoutCommercialSelections } from "./conversationService.js";

test("buildNotesWithoutCommercialSelections elimina financing, promotion y purchase_preferences", () => {
  const input = JSON.stringify({
    customer_info: { nombre: "Ana", telefono: "5512345678" },
    financing_selection: { plan_id: "p1", plan_name: "Plan 24" },
    promotion_selection: { promotion_id: "promo1", title: "Descuento" },
    purchase_preferences: { transmission: "estandar", payment_type: "financiado" },
  });
  const result = buildNotesWithoutCommercialSelections(input);
  assert.equal(result.hadFinancing, true);
  assert.equal(result.hadPromotion, true);
  assert.equal(result.hadPurchasePreferences, true);
  assert.deepEqual(JSON.parse(result.notes), {
    customer_info: { nombre: "Ana", telefono: "5512345678" },
  });
});

test("buildNotesWithoutCommercialSelections conserva customer_info", () => {
  const input = JSON.stringify({
    customer_info: { nombre: "Luis", email: "luis@example.com" },
  });
  const result = buildNotesWithoutCommercialSelections(input);
  assert.equal(result.hadFinancing, false);
  assert.equal(result.hadPromotion, false);
  assert.equal(result.hadPurchasePreferences, false);
  assert.deepEqual(JSON.parse(result.notes), {
    customer_info: { nombre: "Luis", email: "luis@example.com" },
  });
});

test("buildNotesWithoutCommercialSelections maneja notes invalido o vacio", () => {
  assert.deepEqual(buildNotesWithoutCommercialSelections(null), {
    notes: null,
    hadFinancing: false,
    hadPromotion: false,
    hadPurchasePreferences: false,
  });
  assert.deepEqual(buildNotesWithoutCommercialSelections(""), {
    notes: null,
    hadFinancing: false,
    hadPromotion: false,
    hadPurchasePreferences: false,
  });
  assert.deepEqual(buildNotesWithoutCommercialSelections("not-json"), {
    notes: null,
    hadFinancing: false,
    hadPromotion: false,
    hadPurchasePreferences: false,
  });
});

test("buildNotesWithoutCommercialSelections devuelve null si solo habia selecciones comerciales", () => {
  const input = JSON.stringify({
    financing_selection: { plan_id: "p1" },
    promotion_selection: { promotion_id: "promo1" },
    purchase_preferences: { transmission: "automatico", payment_type: "contado" },
  });
  const result = buildNotesWithoutCommercialSelections(input);
  assert.equal(result.notes, null);
  assert.equal(result.hadFinancing, true);
  assert.equal(result.hadPromotion, true);
  assert.equal(result.hadPurchasePreferences, true);
});
