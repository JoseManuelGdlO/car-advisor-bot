"use strict";

/**
 * Horario de toma de leads por vendedor:
 * - users.auto_assign_leads (apagado por defecto)
 * - users.weekly_schedule (JSON, días vacíos = nunca disponible)
 */

const EMPTY_WEEKLY_SCHEDULE = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const users = await queryInterface.describeTable("users");

    if (!users.auto_assign_leads) {
      await queryInterface.addColumn("users", "auto_assign_leads", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!users.weekly_schedule) {
      await queryInterface.addColumn("users", "weekly_schedule", {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: EMPTY_WEEKLY_SCHEDULE,
      });
    }
  },

  async down(queryInterface) {
    const users = await queryInterface.describeTable("users");
    if (users.weekly_schedule) {
      await queryInterface.removeColumn("users", "weekly_schedule");
    }
    if (users.auto_assign_leads) {
      await queryInterface.removeColumn("users", "auto_assign_leads");
    }
  },
};
