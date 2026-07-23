"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("financing_plans", "min_down_payment_percent", {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
    });
    await queryInterface.addColumn("financing_plans", "min_term_months", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("financing_plans", "min_term_months");
    await queryInterface.removeColumn("financing_plans", "min_down_payment_percent");
  },
};
