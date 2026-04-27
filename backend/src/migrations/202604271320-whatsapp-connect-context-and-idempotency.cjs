"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Tabla de recibos para deduplicación e historial de eventos de proveedor.
    await queryInterface.createTable("channel_event_receipts", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("(UUID())") },
      owner_user_id: { type: Sequelize.UUID, allowNull: false },
      channel_integration_id: { type: Sequelize.UUID, allowNull: false },
      provider: { type: Sequelize.STRING(60), allowNull: false },
      provider_event_id: { type: Sequelize.STRING(120), allowNull: false },
      event_type: { type: Sequelize.STRING(80), allowNull: true },
      received_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      status: {
        type: Sequelize.ENUM("accepted", "processed", "ignored", "failed"),
        allowNull: false,
        defaultValue: "accepted",
      },
      error: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
      },
    });
    await queryInterface.addIndex("channel_event_receipts", ["provider", "provider_event_id"], {
      unique: true,
      name: "ux_channel_event_receipts_provider_event",
    });
    await queryInterface.addIndex("channel_event_receipts", ["owner_user_id", "channel_integration_id"], {
      name: "idx_channel_event_receipts_owner_integration",
    });
    await queryInterface.addIndex("channel_event_receipts", ["received_at"], {
      name: "idx_channel_event_receipts_received_at",
    });

    await queryInterface.addConstraint("channel_event_receipts", {
      fields: ["owner_user_id"],
      type: "foreign key",
      name: "fk_channel_event_receipts_owner_user",
      references: { table: "users", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("channel_event_receipts", {
      fields: ["channel_integration_id"],
      type: "foreign key",
      name: "fk_channel_event_receipts_integration",
      references: { table: "channel_integrations", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    // Tabla de contexto de conversación por usuario externo + device (routing estable).
    await queryInterface.createTable("channel_conversation_contexts", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("(UUID())") },
      owner_user_id: { type: Sequelize.UUID, allowNull: false },
      channel: { type: Sequelize.STRING(32), allowNull: false },
      external_user_id: { type: Sequelize.STRING(80), allowNull: false },
      channel_integration_id: { type: Sequelize.UUID, allowNull: false },
      device_id: { type: Sequelize.STRING(80), allowNull: false },
      tenant_id: { type: Sequelize.STRING(80), allowNull: true },
      conversation_id: { type: Sequelize.UUID, allowNull: true },
      client_lead_id: { type: Sequelize.UUID, allowNull: true },
      last_provider_message_id: { type: Sequelize.STRING(120), allowNull: true },
      last_seen_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
      },
    });
    await queryInterface.addIndex("channel_conversation_contexts", ["owner_user_id", "channel", "external_user_id", "device_id"], {
      unique: true,
      name: "ux_channel_conversation_contexts_lookup",
    });
    await queryInterface.addIndex("channel_conversation_contexts", ["channel_integration_id"], {
      name: "idx_channel_conversation_contexts_integration",
    });
    await queryInterface.addConstraint("channel_conversation_contexts", {
      fields: ["owner_user_id"],
      type: "foreign key",
      name: "fk_channel_conversation_contexts_owner_user",
      references: { table: "users", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("channel_conversation_contexts", {
      fields: ["channel_integration_id"],
      type: "foreign key",
      name: "fk_channel_conversation_contexts_integration",
      references: { table: "channel_integrations", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("channel_conversation_contexts", {
      fields: ["conversation_id"],
      type: "foreign key",
      name: "fk_channel_conversation_contexts_conversation",
      references: { table: "conversations", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("channel_conversation_contexts", {
      fields: ["client_lead_id"],
      type: "foreign key",
      name: "fk_channel_conversation_contexts_client_lead",
      references: { table: "client_leads", field: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("channel_conversation_contexts");
    await queryInterface.dropTable("channel_event_receipts");
  },
};
