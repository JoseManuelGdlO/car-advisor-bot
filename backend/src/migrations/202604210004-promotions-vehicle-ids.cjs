"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("promotions");
    if (!table.vehicle_ids) {
      await queryInterface.addColumn("promotions", "vehicle_ids", {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: [],
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable("promotions");
    if (table.vehicle_ids) {
      await queryInterface.removeColumn("promotions", "vehicle_ids");
    }
  },
};
