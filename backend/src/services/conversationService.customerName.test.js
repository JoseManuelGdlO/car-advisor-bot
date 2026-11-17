import test from "node:test";
import assert from "node:assert/strict";
import {
  isGenericLeadName,
  isStrongCustomerInfo,
  mergeCustomerInfo,
  shouldApplyCustomerName,
} from "./conversationService.js";

test("isGenericLeadName trata vacío y Cliente como genérico", () => {
  assert.equal(isGenericLeadName(""), true);
  assert.equal(isGenericLeadName("  "), true);
  assert.equal(isGenericLeadName("Cliente"), true);
  assert.equal(isGenericLeadName("cliente"), true);
  assert.equal(isGenericLeadName("Luis Velarde"), false);
});

test("isStrongCustomerInfo exige telefono o email", () => {
  assert.equal(isStrongCustomerInfo({ nombre: "Luis WA" }), false);
  assert.equal(isStrongCustomerInfo({ nombre: "Luis", telefono: "6121234567" }), true);
  assert.equal(isStrongCustomerInfo({ nombre: "Luis", email: "a@b.com" }), true);
});

test("perfil WhatsApp rellena nombre genérico y no pisa uno real", () => {
  const profile = { nombre: "Luis WA" };
  assert.equal(shouldApplyCustomerName({ currentName: "Cliente", customerInfo: profile }), true);
  assert.equal(shouldApplyCustomerName({ currentName: "Luis Velarde", customerInfo: profile }), false);
});

test("formulario (strong) pisa el nombre de perfil", () => {
  const form = { nombre: "Luis Velarde", telefono: "6121234567", email: "a@b.com" };
  assert.equal(shouldApplyCustomerName({ currentName: "Luis WA", customerInfo: form }), true);
});

test("mergeCustomerInfo conserva nombre previo si la info es solo perfil", () => {
  const merged = mergeCustomerInfo({ nombre: "Luis Velarde", email: "a@b.com" }, { nombre: "Luis WA" });
  assert.equal(merged.nombre, "Luis Velarde");
  assert.equal(merged.email, "a@b.com");
});

test("mergeCustomerInfo aplica perfil cuando no hay nombre previo", () => {
  const merged = mergeCustomerInfo({}, { nombre: "Luis WA" });
  assert.equal(merged.nombre, "Luis WA");
});

test("mergeCustomerInfo aplica formulario sobre perfil", () => {
  const merged = mergeCustomerInfo(
    { nombre: "Luis WA" },
    { nombre: "Luis Velarde", telefono: "6121234567", email: "a@b.com" },
  );
  assert.equal(merged.nombre, "Luis Velarde");
  assert.equal(merged.telefono, "6121234567");
  assert.equal(merged.email, "a@b.com");
});
