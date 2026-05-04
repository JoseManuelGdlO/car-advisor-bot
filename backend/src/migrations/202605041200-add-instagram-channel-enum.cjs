"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") {
      console.warn("[202605041200-add-instagram-channel-enum] Skipping: expected mysql dialect");
      return;
    }
    await queryInterface.sequelize.query(
      "ALTER TABLE conversations MODIFY COLUMN channel ENUM('whatsapp','facebook','telegram','web','api','instagram') NOT NULL DEFAULT 'web'"
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE client_leads MODIFY COLUMN channel ENUM('whatsapp','facebook','telegram','web','api','instagram') NOT NULL DEFAULT 'web'"
    );
  },

  async down(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") return;
    await queryInterface.sequelize.query(
      "UPDATE conversations SET channel = 'api' WHERE channel = 'instagram'"
    );
    await queryInterface.sequelize.query(
      "UPDATE client_leads SET channel = 'api' WHERE channel = 'instagram'"
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE conversations MODIFY COLUMN channel ENUM('whatsapp','facebook','telegram','web','api') NOT NULL DEFAULT 'web'"
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE client_leads MODIFY COLUMN channel ENUM('whatsapp','facebook','telegram','web','api') NOT NULL DEFAULT 'web'"
    );
  },
};
