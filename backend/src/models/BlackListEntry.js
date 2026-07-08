import { DataTypes } from "sequelize";

export default function BlackListEntryModel(sequelize) {
  return sequelize.define("blacklist", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ownerUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "owner_user_id",
    },
    phone: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
  });
}
