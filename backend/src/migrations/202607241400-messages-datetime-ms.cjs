"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") {
      console.warn("[202607241400-messages-datetime-ms] Skipping: expected mysql dialect");
      return;
    }

    // Guarda fracciones de segundo para ordenar mensajes creados en el mismo segundo.
    await queryInterface.sequelize.query(
      "ALTER TABLE messages MODIFY COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE messages MODIFY COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)",
    );
  },

  async down(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") return;

    await queryInterface.sequelize.query(
      "ALTER TABLE messages MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE messages MODIFY COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    );
  },
};
