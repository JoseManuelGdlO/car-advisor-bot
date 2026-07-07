"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") {
      console.warn("[202607071500-client-lead-display-phone] Skipping: expected mysql dialect");
      return;
    }
    await queryInterface.sequelize.query(
      "ALTER TABLE client_leads ADD COLUMN display_phone VARCHAR(40) NULL AFTER phone"
    );
    await queryInterface.addIndex("client_leads", ["owner_user_id", "display_phone"], {
      name: "idx_client_leads_owner_display_phone",
    });
  },

  async down(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") return;
    await queryInterface.removeIndex("client_leads", "idx_client_leads_owner_display_phone");
    await queryInterface.sequelize.query("ALTER TABLE client_leads DROP COLUMN display_phone");
  },
};
