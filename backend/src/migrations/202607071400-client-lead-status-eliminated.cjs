"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") {
      console.warn("[202607071400-client-lead-status-eliminated] Skipping: expected mysql dialect");
      return;
    }
    await queryInterface.sequelize.query(
      "ALTER TABLE client_leads MODIFY COLUMN status ENUM('lead','negotiation','sold','lost','eliminated') NOT NULL DEFAULT 'lead'"
    );
  },

  async down(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") return;
    await queryInterface.sequelize.query(
      "UPDATE client_leads SET status = 'lost' WHERE status = 'eliminated'"
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE client_leads MODIFY COLUMN status ENUM('lead','negotiation','sold','lost') NOT NULL DEFAULT 'lead'"
    );
  },
};
