"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("vehicles");
    if (!table.technical_sheet_url) {
      await queryInterface.addColumn("vehicles", "technical_sheet_url", {
        type: Sequelize.STRING(512),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("vehicles");
    if (table.technical_sheet_url) {
      await queryInterface.removeColumn("vehicles", "technical_sheet_url");
    }
  },
};
