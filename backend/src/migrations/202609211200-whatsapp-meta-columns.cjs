"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("channel_integrations", "waba_id", {
      type: Sequelize.STRING(40),
      allowNull: true,
    });
    await queryInterface.addColumn("channel_integrations", "phone_number_id", {
      type: Sequelize.STRING(40),
      allowNull: true,
    });
    await queryInterface.addColumn("channel_integrations", "display_phone_number", {
      type: Sequelize.STRING(40),
      allowNull: true,
    });
    await queryInterface.addColumn("channel_integrations", "coexistence_enabled", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addIndex("channel_integrations", ["phone_number_id"], {
      name: "idx_channel_integrations_phone_number_id",
    });
  },
  async down(queryInterface) {
    await queryInterface.removeIndex("channel_integrations", "idx_channel_integrations_phone_number_id");
    await queryInterface.removeColumn("channel_integrations", "coexistence_enabled");
    await queryInterface.removeColumn("channel_integrations", "display_phone_number");
    await queryInterface.removeColumn("channel_integrations", "phone_number_id");
    await queryInterface.removeColumn("channel_integrations", "waba_id");
  },
};
