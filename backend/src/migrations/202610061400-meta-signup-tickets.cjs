"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") {
      console.warn("[202610061400-meta-signup-tickets] Skipping: expected mysql dialect");
      return;
    }

    await queryInterface.createTable("meta_signup_tickets", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("(UUID())"),
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      ticket_hash: {
        type: Sequelize.CHAR(64),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM("pending", "completed", "failed", "cancelled"),
        allowNull: false,
        defaultValue: "pending",
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      error_message: {
        type: Sequelize.STRING(300),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("meta_signup_tickets", ["ticket_hash"], {
      name: "uidx_meta_signup_tickets_hash",
      unique: true,
    });
  },

  async down(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") return;
    await queryInterface.dropTable("meta_signup_tickets");
  },
};
