import { createRequire } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const migration = require("./202611201000-roles-sellers.cjs");

const Sequelize = {
  ENUM: () => "ENUM",
  UUID: "UUID",
  BOOLEAN: "BOOLEAN",
  STRING: () => "STRING",
};

const createQueryInterface = ({ users = {}, leads = {}, indexes = [], sellerCount = 0 } = {}) => {
  const calls = [];
  const queryInterface = {
    calls,
    async describeTable(table) {
      calls.push(["describeTable", table]);
      if (table === "users") return users;
      if (table === "client_leads") return leads;
      throw new Error(`unexpected table ${table}`);
    },
    async addColumn(table, column) {
      calls.push(["addColumn", table, column]);
    },
    async removeColumn(table, column) {
      calls.push(["removeColumn", table, column]);
    },
    async changeColumn(table, column, spec) {
      calls.push(["changeColumn", table, column, spec.allowNull]);
    },
    async addIndex(table, _columns, options) {
      calls.push(["addIndex", table, options.name]);
    },
    async removeIndex(table, name) {
      calls.push(["removeIndex", table, name]);
    },
    sequelize: {
      async query(sql) {
        calls.push(["query", sql]);
        if (String(sql).startsWith("SHOW INDEX FROM `users`")) {
          return [indexes.filter((name) => name.startsWith("users_")).map((Key_name) => ({ Key_name }))];
        }
        if (String(sql).startsWith("SHOW INDEX FROM `client_leads`")) {
          return [indexes.filter((name) => name.startsWith("client_leads_")).map((Key_name) => ({ Key_name }))];
        }
        if (String(sql).includes("COUNT(*)")) {
          return [[{ sellerCount }]];
        }
        return [[]];
      },
    },
  };
  return queryInterface;
};

const named = (qi, kind) => qi.calls.filter((call) => call[0] === kind);

test("up: el backfill a admin solo corre cuando role aún no existe", async () => {
  const qi = createQueryInterface();
  await migration.up(qi, Sequelize);
  const updates = named(qi, "query").map((call) => call[1]).filter((sql) => String(sql).includes("UPDATE users"));
  assert.equal(updates.length, 1);
  assert.match(updates[0], /role = 'admin'/);
  assert.deepEqual(
    named(qi, "addIndex").map((call) => call[2]),
    ["users_tenant_owner_user_id_idx", "client_leads_owner_assigned_seller_idx"],
  );
});

test("up: reejecutar con vendedores no los convierte en admins y no duplica índices", async () => {
  const qi = createQueryInterface({
    users: { role: {}, tenant_owner_user_id: {}, notify_assigned_lead_messages: {} },
    leads: { assigned_seller_user_id: {} },
    indexes: ["users_tenant_owner_user_id_idx", "client_leads_owner_assigned_seller_idx"],
  });
  await migration.up(qi, Sequelize);
  const updates = named(qi, "query").map((call) => call[1]).filter((sql) => String(sql).includes("UPDATE users"));
  assert.deepEqual(updates, []);
  assert.equal(named(qi, "addColumn").length, 0);
  assert.equal(named(qi, "addIndex").length, 0);
});

test("down: aborta si hay vendedores y no los borra", async () => {
  const qi = createQueryInterface({
    users: { role: {}, tenant_owner_user_id: {}, notify_assigned_lead_messages: {} },
    leads: { assigned_seller_user_id: {} },
    indexes: ["users_tenant_owner_user_id_idx", "client_leads_owner_assigned_seller_idx"],
    sellerCount: 2,
  });
  await assert.rejects(() => migration.down(qi, Sequelize), /down aborted/);
  const sql = named(qi, "query").map((call) => call[1]).join("\n");
  assert.doesNotMatch(sql, /DELETE FROM users/i);
  assert.equal(named(qi, "removeColumn").length, 0);
});

test("down: sin vendedores revierte columnas e índices", async () => {
  const qi = createQueryInterface({
    users: { role: {}, tenant_owner_user_id: {}, notify_assigned_lead_messages: {} },
    leads: { assigned_seller_user_id: {} },
    indexes: ["users_tenant_owner_user_id_idx", "client_leads_owner_assigned_seller_idx"],
    sellerCount: 0,
  });
  await migration.down(qi, Sequelize);
  assert.deepEqual(
    named(qi, "removeIndex").map((call) => call[2]),
    ["client_leads_owner_assigned_seller_idx", "users_tenant_owner_user_id_idx"],
  );
  assert.deepEqual(
    named(qi, "removeColumn").map((call) => [call[1], call[2]]),
    [
      ["client_leads", "assigned_seller_user_id"],
      ["users", "notify_assigned_lead_messages"],
      ["users", "tenant_owner_user_id"],
      ["users", "role"],
    ],
  );
  const sql = named(qi, "query").map((call) => call[1]).join("\n");
  assert.doesNotMatch(sql, /DELETE FROM users/i);
});
