"use strict";

/**
 * Roles tenant + vendedores:
 * - users.role (admin|seller), users.tenant_owner_user_id, users.notify_assigned_lead_messages
 * - users.calendar_scheduling_url pasa a NULLable (vendedores no tienen URL propia)
 * - client_leads.assigned_seller_user_id
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const users = await queryInterface.describeTable("users");

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

    // Backfill explícito para usuarios existentes.
    await queryInterface.sequelize.query(
      "UPDATE users SET role = 'admin', tenant_owner_user_id = NULL, notify_assigned_lead_messages = 1",
    );

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

    await queryInterface.addIndex("users", ["tenant_owner_user_id"], {
      name: "users_tenant_owner_user_id_idx",
    });
    await queryInterface.addIndex("client_leads", ["owner_user_id", "assigned_seller_user_id"], {
      name: "client_leads_owner_assigned_seller_idx",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex("client_leads", "client_leads_owner_assigned_seller_idx");
    await queryInterface.removeIndex("users", "users_tenant_owner_user_id_idx");

    const leads = await queryInterface.describeTable("client_leads");
    if (leads.assigned_seller_user_id) {
      await queryInterface.removeColumn("client_leads", "assigned_seller_user_id");
    }

    // Los vendedores no tienen URL de calendario: se elimina antes de volver a NOT NULL.
    await queryInterface.sequelize.query("DELETE FROM users WHERE role = 'seller'");
    await queryInterface.changeColumn("users", "calendar_scheduling_url", {
      type: Sequelize.STRING(500),
      allowNull: false,
    });

    const users = await queryInterface.describeTable("users");
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
