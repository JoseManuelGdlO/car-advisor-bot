"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") {
      console.warn("[202609221200-whatsapp-message-templates] Skipping: expected mysql dialect");
      return;
    }

    await queryInterface.createTable("whatsapp_message_templates", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("(UUID())"),
      },
      owner_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      waba_id: {
        type: Sequelize.STRING(40),
        allowNull: false,
      },
      meta_template_id: {
        type: Sequelize.STRING(40),
        allowNull: true,
      },
      name: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      display_name: {
        type: Sequelize.STRING(160),
        allowNull: false,
      },
      language: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: "es_MX",
      },
      category: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "MARKETING",
      },
      components: {
        type: Sequelize.JSON,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM("PENDING", "APPROVED", "REJECTED", "PAUSED", "DISABLED"),
        allowNull: false,
        defaultValue: "PENDING",
      },
      rejected_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      last_status_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      purpose: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "followup",
      },
      is_waba_default: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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

    await queryInterface.addIndex("whatsapp_message_templates", ["waba_id", "name"], {
      name: "uniq_whatsapp_message_templates_waba_name",
      unique: true,
    });
  },

  async down(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") return;
    await queryInterface.dropTable("whatsapp_message_templates");
  },
};
