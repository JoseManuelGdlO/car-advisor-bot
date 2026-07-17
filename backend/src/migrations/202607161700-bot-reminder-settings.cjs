"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("bot_settings", "reminder_enabled", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("bot_settings", "reminder_message", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn("bot_settings", "reminder_hours", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn("bot_settings", "reminder_once_per_conversation", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("conversations", "last_reminder_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("conversations", "last_reminder_at");
    await queryInterface.removeColumn("bot_settings", "reminder_once_per_conversation");
    await queryInterface.removeColumn("bot_settings", "reminder_hours");
    await queryInterface.removeColumn("bot_settings", "reminder_message");
    await queryInterface.removeColumn("bot_settings", "reminder_enabled");
  },
};
