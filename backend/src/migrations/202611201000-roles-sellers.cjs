"use strict";

/**
 * Roles tenant + vendedores:
 * - users.role (admin|seller), users.tenant_owner_user_id, users.notify_assigned_lead_messages
 * - users.calendar_scheduling_url pasa a NULLable (vendedores no tienen URL propia)
 * - client_leads.assigned_seller_user_id
 *
 * down no borra vendedores. Si queda algún user con role='seller', aborta:
 * hay que quitarlos o convertirlos a mano antes de revertir (cuentas, dispositivos e inbox se conservan).
 */

const USERS_TENANT_INDEX = "users_tenant_owner_user_id_idx";
const LEADS_SELLER_INDEX = "client_leads_owner_assigned_seller_idx";

const indexExists = async (queryInterface, table, indexName) => {
  const [rows] = await queryInterface.sequelize.query(`SHOW INDEX FROM \`${table}\``);
  return (rows || []).some((row) => row.Key_name === indexName);
};

const ensureIndex = async (queryInterface, table, columns, name) => {
  if (await indexExists(queryInterface, table, name)) return;
  await queryInterface.addIndex(table, columns, { name });
};

const dropIndexIfExists = async (queryInterface, table, name) => {
  if (!(await indexExists(queryInterface, table, name))) return;
  await queryInterface.removeIndex(table, name);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const users = await queryInterface.describeTable("users");
    // El default de addColumn ya rellena filas viejas. El UPDATE solo corre en esa
    // primera introducción de `role`: reejecutar no debe convertir sellers en admins.
    const backfillExistingUsers = !users.role;

    if (!users.role) {
      await queryInterface.addColumn("users", "role", {
        type: Sequelize.ENUM("admin", "seller"),
        allowNull: false,
        defaultValue: "admin",
      });
    }
    if (!users.tenant_owner_user_id) {
      await queryInterface.addColumn("users", "tenant_owner_user_id", {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }
    if (!users.notify_assigned_lead_messages) {
      await queryInterface.addColumn("users", "notify_assigned_lead_messages", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }

    if (backfillExistingUsers) {
      await queryInterface.sequelize.query(
        "UPDATE users SET role = 'admin', tenant_owner_user_id = NULL, notify_assigned_lead_messages = 1",
      );
    }

    await queryInterface.changeColumn("users", "calendar_scheduling_url", {
      type: Sequelize.STRING(500),
      allowNull: true,
    });

    const leads = await queryInterface.describeTable("client_leads");
    if (!leads.assigned_seller_user_id) {
      await queryInterface.addColumn("client_leads", "assigned_seller_user_id", {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }

    await ensureIndex(queryInterface, "users", ["tenant_owner_user_id"], USERS_TENANT_INDEX);
    await ensureIndex(
      queryInterface,
      "client_leads",
      ["owner_user_id", "assigned_seller_user_id"],
      LEADS_SELLER_INDEX,
    );
  },

  async down(queryInterface, Sequelize) {
    const users = await queryInterface.describeTable("users");
    if (users.role) {
      const [rows] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) AS sellerCount FROM users WHERE role = 'seller'",
      );
      const sellerCount = Number(rows?.[0]?.sellerCount ?? 0);
      if (sellerCount > 0) {
        throw new Error(
          "down aborted: users with role=seller exist. This migration does not delete sellers; remove or convert them manually before reverting.",
        );
      }
    }

    await dropIndexIfExists(queryInterface, "client_leads", LEADS_SELLER_INDEX);
    await dropIndexIfExists(queryInterface, "users", USERS_TENANT_INDEX);

    const leads = await queryInterface.describeTable("client_leads");
    if (leads.assigned_seller_user_id) {
      await queryInterface.removeColumn("client_leads", "assigned_seller_user_id");
    }

    // Sin vendedores, el resto de usuarios son admins y conservan su URL de calendario.
    await queryInterface.changeColumn("users", "calendar_scheduling_url", {
      type: Sequelize.STRING(500),
      allowNull: false,
    });

    if (users.notify_assigned_lead_messages) {
      await queryInterface.removeColumn("users", "notify_assigned_lead_messages");
    }
    if (users.tenant_owner_user_id) {
      await queryInterface.removeColumn("users", "tenant_owner_user_id");
    }
    if (users.role) {
      await queryInterface.removeColumn("users", "role");
    }
  },
};
