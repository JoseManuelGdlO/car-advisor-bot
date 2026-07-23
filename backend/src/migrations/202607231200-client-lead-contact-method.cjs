"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") {
      console.warn("[202607231200-client-lead-contact-method] Skipping: expected mysql dialect");
      return;
    }
    await queryInterface.sequelize.query(
      "ALTER TABLE client_leads ADD COLUMN contact_method ENUM('whatsapp','call','appointment') NULL AFTER channel"
    );
  },

  async down(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") return;
    await queryInterface.sequelize.query("ALTER TABLE client_leads DROP COLUMN contact_method");
  },
};
