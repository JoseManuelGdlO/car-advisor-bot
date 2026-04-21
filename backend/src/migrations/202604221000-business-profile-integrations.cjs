"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("business_profiles", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("(UUID())") },
      owner_user_id: { type: Sequelize.UUID, allowNull: false, unique: true },
      trade_name: { type: Sequelize.STRING(200), allowNull: true },
      legal_name: { type: Sequelize.STRING(200), allowNull: true },
      tax_id: { type: Sequelize.STRING(64), allowNull: true },
      business_phone: { type: Sequelize.STRING(40), allowNull: true },
      business_email: { type: Sequelize.STRING(190), allowNull: true },
      website: { type: Sequelize.STRING(500), allowNull: true },
      address_line: { type: Sequelize.STRING(255), allowNull: true },
      city: { type: Sequelize.STRING(120), allowNull: true },
      state: { type: Sequelize.STRING(120), allowNull: true },
      country: { type: Sequelize.STRING(120), allowNull: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      logo_url: { type: Sequelize.STRING(500), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP") },
    });
    await queryInterface.addIndex("business_profiles", ["owner_user_id"], { name: "idx_business_profiles_owner" });
    await queryInterface.addConstraint("business_profiles", {
      fields: ["owner_user_id"],
      type: "foreign key",
      name: "fk_business_profiles_owner_user",
      references: { table: "users", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.createTable("channel_integrations", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("(UUID())") },
      owner_user_id: { type: Sequelize.UUID, allowNull: false },
      channel: { type: Sequelize.STRING(32), allowNull: false },
      provider: { type: Sequelize.STRING(60), allowNull: false, defaultValue: "meta" },
      display_name: { type: Sequelize.STRING(160), allowNull: true },
      status: {
        type: Sequelize.ENUM("draft", "active", "error", "disabled"),
        allowNull: false,
        defaultValue: "draft",
      },
      webhook_url: { type: Sequelize.STRING(500), allowNull: true },
      last_healthcheck_at: { type: Sequelize.DATE, allowNull: true },
      last_error: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP") },
    });
    await queryInterface.addIndex("channel_integrations", ["owner_user_id"], { name: "idx_channel_integrations_owner" });
    await queryInterface.addConstraint("channel_integrations", {
      fields: ["owner_user_id"],
      type: "foreign key",
      name: "fk_channel_integrations_owner_user",
      references: { table: "users", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addIndex("channel_integrations", ["owner_user_id", "channel", "provider"], {
      name: "uniq_channel_integrations_owner_channel_provider",
      unique: true,
    });

    await queryInterface.createTable("channel_credentials", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("(UUID())") },
      owner_user_id: { type: Sequelize.UUID, allowNull: false },
      channel_integration_id: { type: Sequelize.UUID, allowNull: false },
      credential_type: { type: Sequelize.STRING(40), allowNull: false, defaultValue: "json_secrets" },
      cipher_text: { type: Sequelize.TEXT("long"), allowNull: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP") },
    });
    await queryInterface.addIndex("channel_credentials", ["owner_user_id"], { name: "idx_channel_credentials_owner" });
    await queryInterface.addIndex("channel_credentials", ["channel_integration_id"], { name: "idx_channel_credentials_integration" });
    await queryInterface.addConstraint("channel_credentials", {
      fields: ["owner_user_id"],
      type: "foreign key",
      name: "fk_channel_credentials_owner_user",
      references: { table: "users", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    await queryInterface.addConstraint("channel_credentials", {
      fields: ["channel_integration_id"],
      type: "foreign key",
      name: "fk_channel_credentials_integration",
      references: { table: "channel_integrations", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("channel_credentials");
    await queryInterface.dropTable("channel_integrations");
    await queryInterface.dropTable("business_profiles");
  },
};
