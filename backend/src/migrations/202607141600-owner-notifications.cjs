"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = async (name) => {
      try {
        await queryInterface.describeTable(name);
        return true;
      } catch {
        return false;
      }
    };

    const hasIndex = async (table, keyName) => {
      const [indexes] = await queryInterface.sequelize.query(`SHOW INDEX FROM \`${table}\``);
      return indexes.some((x) => x.Key_name === keyName);
    };

    const hasFk = async (table, constraintName) => {
      const [rows] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND CONSTRAINT_NAME = :name AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
        { replacements: { table, name: constraintName } },
      );
      return rows.length > 0;
    };

    if (!(await tableExists("owner_notifications"))) {
      await queryInterface.createTable("owner_notifications", {
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("(UUID())") },
        owner_user_id: { type: Sequelize.UUID, allowNull: false },
        title: { type: Sequelize.STRING(120), allowNull: false },
        body: { type: Sequelize.STRING(500), allowNull: false },
        kind: { type: Sequelize.STRING(64), allowNull: true },
        conversation_id: { type: Sequelize.UUID, allowNull: true },
        data: { type: Sequelize.JSON, allowNull: true },
        read_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
        },
      });
    }

    if (!(await hasIndex("owner_notifications", "idx_owner_notifications_owner_created"))) {
      await queryInterface.addIndex("owner_notifications", ["owner_user_id", "created_at"], {
        name: "idx_owner_notifications_owner_created",
      });
    }

    if (!(await hasIndex("owner_notifications", "idx_owner_notifications_owner_read"))) {
      await queryInterface.addIndex("owner_notifications", ["owner_user_id", "read_at"], {
        name: "idx_owner_notifications_owner_read",
      });
    }

    if (!(await hasFk("owner_notifications", "fk_owner_notifications_owner_user"))) {
      await queryInterface.addConstraint("owner_notifications", {
        fields: ["owner_user_id"],
        type: "foreign key",
        name: "fk_owner_notifications_owner_user",
        references: { table: "users", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("owner_notifications");
  },
};
