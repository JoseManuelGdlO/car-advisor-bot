"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("bot_settings", "tone", {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: "cercano",
    });
    await queryInterface.addColumn("bot_settings", "emoji_style", {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: "pocos",
    });
    await queryInterface.addColumn("bot_settings", "sales_proactivity", {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: "medio",
    });
    await queryInterface.addColumn("bot_settings", "custom_instructions", {
      type: Sequelize.TEXT,
      allowNull: false,
      defaultValue: "",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("bot_settings", "custom_instructions");
    await queryInterface.removeColumn("bot_settings", "sales_proactivity");
    await queryInterface.removeColumn("bot_settings", "emoji_style");
    await queryInterface.removeColumn("bot_settings", "tone");
  },
};
