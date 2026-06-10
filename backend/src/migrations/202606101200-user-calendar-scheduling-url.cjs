"use strict";

const DEFAULT_CALENDAR_URL = "https://calendar.app.google/tYniJNfcrd8qXvut8";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "calendar_scheduling_url", {
      type: Sequelize.STRING(500),
      allowNull: true,
    });

    await queryInterface.sequelize.query(
      `UPDATE users SET calendar_scheduling_url = :url WHERE calendar_scheduling_url IS NULL`,
      { replacements: { url: DEFAULT_CALENDAR_URL } },
    );

    await queryInterface.changeColumn("users", "calendar_scheduling_url", {
      type: Sequelize.STRING(500),
      allowNull: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("users", "calendar_scheduling_url");
  },
};
