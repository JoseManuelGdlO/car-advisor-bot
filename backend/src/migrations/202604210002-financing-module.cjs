"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("financing_plans", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("(UUID())") },
      owner_user_id: { type: Sequelize.UUID, allowNull: false },
      name: { type: Sequelize.STRING(160), allowNull: false },
      lender: { type: Sequelize.STRING(120), allowNull: false },
      rate: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      max_term_months: { type: Sequelize.INTEGER, allowNull: false },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      show_rate: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP") },
    });
    await queryInterface.addIndex("financing_plans", ["owner_user_id"]);

    await queryInterface.createTable("financing_requirements", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("(UUID())") },
      owner_user_id: { type: Sequelize.UUID, allowNull: false },
      title: { type: Sequelize.STRING(160), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP") },
    });
    await queryInterface.addIndex("financing_requirements", ["owner_user_id"]);

    await queryInterface.createTable("vehicle_financing_plans", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("(UUID())") },
      owner_user_id: { type: Sequelize.UUID, allowNull: false },
      vehicle_id: { type: Sequelize.UUID, allowNull: false },
      financing_plan_id: { type: Sequelize.UUID, allowNull: false },
      custom_rate: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP") },
    });
    await queryInterface.addIndex("vehicle_financing_plans", ["owner_user_id"]);
    await queryInterface.addIndex("vehicle_financing_plans", ["vehicle_id"]);
    await queryInterface.addIndex("vehicle_financing_plans", ["financing_plan_id"]);
    await queryInterface.addConstraint("vehicle_financing_plans", {
      fields: ["vehicle_id", "financing_plan_id"],
      type: "unique",
      name: "uniq_vehicle_financing_plan",
    });

    await queryInterface.createTable("financing_plan_requirements", {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("(UUID())") },
      owner_user_id: { type: Sequelize.UUID, allowNull: false },
      financing_plan_id: { type: Sequelize.UUID, allowNull: false },
      financing_requirement_id: { type: Sequelize.UUID, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP") },
    });
    await queryInterface.addIndex("financing_plan_requirements", ["owner_user_id"]);
    await queryInterface.addIndex("financing_plan_requirements", ["financing_plan_id"]);
    await queryInterface.addIndex("financing_plan_requirements", ["financing_requirement_id"]);
    await queryInterface.addConstraint("financing_plan_requirements", {
      fields: ["financing_plan_id", "financing_requirement_id"],
      type: "unique",
      name: "uniq_plan_requirement",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("financing_plan_requirements");
    await queryInterface.dropTable("vehicle_financing_plans");
    await queryInterface.dropTable("financing_requirements");
    await queryInterface.dropTable("financing_plans");
  },
};
