"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("users", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("(UUID())") },
      email: { type: Sequelize.STRING(190), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING(255), allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP") },
    });
    for (const t of ["service_tokens", "vehicles", "client_leads", "conversations", "messages", "faqs", "promotions"]) {
      await queryInterface.createTable(t, {
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("(UUID())") },
        owner_user_id: { type: Sequelize.UUID, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP") },
      });
      await queryInterface.addIndex(t, ["owner_user_id"]);
    }
  },
  async down(queryInterface) {
    for (const t of ["promotions", "faqs", "messages", "conversations", "client_leads", "vehicles", "service_tokens", "users"]) {
      await queryInterface.dropTable(t);
    }
  },
};
