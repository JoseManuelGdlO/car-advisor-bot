import { DataTypes } from "sequelize";

export default function UserModel(sequelize) {
  return sequelize.define("users", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(190),
      allowNull: false,
      unique: true,
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "password_hash",
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(32),
    },
    defaultPlatform: {
      type: DataTypes.STRING(20),
      field: "default_platform",
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  });
}
