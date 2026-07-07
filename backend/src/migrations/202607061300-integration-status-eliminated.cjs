"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") {
      console.warn("[202607061300-integration-status-eliminated] Skipping: expected mysql dialect");
      return;
    }
    await queryInterface.sequelize.query(
      "ALTER TABLE channel_integrations MODIFY COLUMN status ENUM('draft','active','error','disabled','eliminated') NOT NULL DEFAULT 'draft'"
    );
  },

  async down(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") return;
    await queryInterface.sequelize.query(
      "UPDATE channel_integrations SET status = 'disabled' WHERE status = 'eliminated'"
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE channel_integrations MODIFY COLUMN status ENUM('draft','active','error','disabled') NOT NULL DEFAULT 'draft'"
    );
  },
};
