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
        { replacements: { table, name: constraintName } }
      );
      return rows.length > 0;
    };

    if (!(await tableExists("push_devices"))) {
      await queryInterface.createTable("push_devices", {
        id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal("(UUID())") },
        owner_user_id: { type: Sequelize.UUID, allowNull: false },
        token: { type: Sequelize.STRING(255), allowNull: false, unique: true },
        platform: { type: Sequelize.ENUM("android", "ios"), allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        last_seen_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP") },
      });
    }

    if (!(await hasIndex("push_devices", "idx_push_devices_owner"))) {
      await queryInterface.addIndex("push_devices", ["owner_user_id"], { name: "idx_push_devices_owner" });
    }

    if (!(await hasIndex("push_devices", "idx_push_devices_owner_active"))) {
      await queryInterface.addIndex("push_devices", ["owner_user_id", "is_active"], { name: "idx_push_devices_owner_active" });
    }

    if (!(await hasFk("push_devices", "fk_push_devices_owner_user"))) {
      await queryInterface.addConstraint("push_devices", {
        fields: ["owner_user_id"],
        type: "foreign key",
        name: "fk_push_devices_owner_user",
        references: { table: "users", field: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("push_devices");
  },
};
