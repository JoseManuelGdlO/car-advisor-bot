import { DataTypes } from "sequelize";

export default function FaqModel(sequelize) {
  return sequelize.define("faqs", {
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
    question: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    answer: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  });
}
