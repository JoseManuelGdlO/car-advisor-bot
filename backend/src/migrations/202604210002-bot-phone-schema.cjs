"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("bot_sessions", {
      session_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("(UUID())"),
      },
      phone: { type: Sequelize.STRING(32), allowNull: false },
      platform: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "web" },
      conversation_id: { type: Sequelize.UUID, allowNull: true },
      state_payload: { type: Sequelize.TEXT("long"), allowNull: false },
      payload_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      expires_at: { type: Sequelize.DATE, allowNull: false },
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

    await queryInterface.addIndex("bot_sessions", ["phone", "platform"], {
      unique: true,
      name: "ux_bot_sessions_phone_platform",
    });
    await queryInterface.addIndex("bot_sessions", ["expires_at"], {
      name: "idx_bot_sessions_expires_at",
    });
    await queryInterface.addIndex("bot_sessions", ["conversation_id"], {
      name: "idx_bot_sessions_conversation_id",
    });

    await queryInterface.addColumn("users", "phone", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn("users", "default_platform", {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
    await queryInterface.addIndex("users", ["phone"], { name: "idx_users_phone" });

    await queryInterface.addColumn("messages", "phone", {
      type: Sequelize.STRING(32),
      allowNull: true,
    });
    await queryInterface.addColumn("messages", "platform", {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
    await queryInterface.addIndex("messages", ["phone", "platform", "created_at"], {
      name: "idx_messages_phone_platform_created_at",
    });

    await queryInterface.changeColumn("messages", "from", {
      type: Sequelize.ENUM("client", "bot", "seller", "user", "assistant", "system"),
      allowNull: false,
      defaultValue: "client",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("messages", "from", {
      type: Sequelize.ENUM("client", "bot", "seller"),
      allowNull: false,
      defaultValue: "client",
    });

    await queryInterface.removeIndex("messages", "idx_messages_phone_platform_created_at");
    await queryInterface.removeColumn("messages", "platform");
    await queryInterface.removeColumn("messages", "phone");

    await queryInterface.removeIndex("users", "idx_users_phone");
    await queryInterface.removeColumn("users", "default_platform");
    await queryInterface.removeColumn("users", "phone");

    await queryInterface.removeIndex("bot_sessions", "idx_bot_sessions_conversation_id");
    await queryInterface.removeIndex("bot_sessions", "idx_bot_sessions_expires_at");
    await queryInterface.removeIndex("bot_sessions", "ux_bot_sessions_phone_platform");
    await queryInterface.dropTable("bot_sessions");

    if (queryInterface.sequelize.getDialect() === "postgres") {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_messages_from";');
    }
  },
};
