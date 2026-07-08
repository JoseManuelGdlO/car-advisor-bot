"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("bot_settings", "bot_name", {
      type: Sequelize.STRING(40),
      allowNull: true,
    });
    await queryInterface.addColumn("bot_settings", "welcome_message", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn("bot_settings", "faq_fallback_message", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("bot_settings", "faq_fallback_message");
    await queryInterface.removeColumn("bot_settings", "welcome_message");
    await queryInterface.removeColumn("bot_settings", "bot_name");
  },
};
