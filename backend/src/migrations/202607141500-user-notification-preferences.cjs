"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("users");

    if (!table.push_enabled) {
      await queryInterface.addColumn("users", "push_enabled", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
    if (!table.notify_lead_interest) {
      await queryInterface.addColumn("users", "notify_lead_interest", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
    if (!table.notify_escalations) {
      await queryInterface.addColumn("users", "notify_escalations", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
    if (!table.notify_inbound_messages) {
      await queryInterface.addColumn("users", "notify_inbound_messages", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("users");
    if (table.notify_inbound_messages) {
      await queryInterface.removeColumn("users", "notify_inbound_messages");
    }
    if (table.notify_escalations) {
      await queryInterface.removeColumn("users", "notify_escalations");
    }
    if (table.notify_lead_interest) {
      await queryInterface.removeColumn("users", "notify_lead_interest");
    }
    if (table.push_enabled) {
      await queryInterface.removeColumn("users", "push_enabled");
    }
  },
};
