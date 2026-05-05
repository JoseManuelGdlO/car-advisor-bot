"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("conversations", "is_human_controlled", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("conversations", "handoff_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("conversations", "handoff_by_user_id", {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addIndex("conversations", ["owner_user_id", "is_human_controlled"], {
      name: "idx_conversations_owner_handoff",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("conversations", "idx_conversations_owner_handoff");
    await queryInterface.removeColumn("conversations", "handoff_by_user_id");
    await queryInterface.removeColumn("conversations", "handoff_at");
    await queryInterface.removeColumn("conversations", "is_human_controlled");
  },
};
