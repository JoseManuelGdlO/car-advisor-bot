import { DataTypes } from "sequelize";

export default function PromotionModel(sequelize) {
  return sequelize.define("promotions", {
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
    title: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    validUntil: {
      type: DataTypes.STRING(40),
      field: "valid_until",
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    appliesTo: {
      type: DataTypes.STRING(160),
      field: "applies_to",
    },
    vehicleIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      field: "vehicle_ids",
    },
  });
}
