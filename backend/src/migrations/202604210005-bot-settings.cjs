"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("bot_settings", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("(UUID())") },
      owner_user_id: { type: Sequelize.UUID, allowNull: false, unique: true },
      is_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      timezone: { type: Sequelize.STRING(120), allowNull: false, defaultValue: "America/Bogota" },
      weekly_schedule: { type: Sequelize.JSON, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP") },
    });

    await queryInterface.addIndex("bot_settings", ["owner_user_id"], { name: "idx_bot_settings_owner" });
    await queryInterface.addConstraint("bot_settings", {
      fields: ["owner_user_id"],
      type: "foreign key",
      name: "fk_bot_settings_owner_user",
      references: { table: "users", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("bot_settings");
  },
};
