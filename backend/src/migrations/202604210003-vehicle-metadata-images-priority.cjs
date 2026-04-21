"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable("vehicles");
    if (!table.image_urls) {
      await queryInterface.addColumn("vehicles", "image_urls", {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: [],
      });
    }
    if (!table.metadata) {
      await queryInterface.addColumn("vehicles", "metadata", {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: {},
      });
    }
    if (!table.outbound_priority) {
      await queryInterface.addColumn("vehicles", "outbound_priority", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
    const [indexes] = await queryInterface.sequelize.query("SHOW INDEX FROM vehicles");
    const hasPriorityIndex = indexes.some((x) => x.Key_name === "idx_vehicle_owner_priority");
    if (!hasPriorityIndex) {
      await queryInterface.addIndex("vehicles", ["owner_user_id", "outbound_priority"], {
        name: "idx_vehicle_owner_priority",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("vehicles", "idx_vehicle_owner_priority");
    await queryInterface.removeColumn("vehicles", "outbound_priority");
    await queryInterface.removeColumn("vehicles", "metadata");
    await queryInterface.removeColumn("vehicles", "image_urls");
  },
};
