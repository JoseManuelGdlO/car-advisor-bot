"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("blacklist", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("(UUID())") },
      owner_user_id: { type: Sequelize.UUID, allowNull: false },
      phone: { type: Sequelize.STRING(40), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP") },
    });

    await queryInterface.addIndex("blacklist", ["owner_user_id"], { name: "idx_blacklist_owner" });
    await queryInterface.addIndex("blacklist", ["owner_user_id", "phone"], {
      name: "uniq_blacklist_owner_phone",
      unique: true,
    });
    await queryInterface.addConstraint("blacklist", {
      fields: ["owner_user_id"],
      type: "foreign key",
      name: "fk_blacklist_owner_user",
      references: { table: "users", field: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("blacklist");
  },
};
