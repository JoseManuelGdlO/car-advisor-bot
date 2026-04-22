import { DataTypes } from "sequelize";

export default function VehicleModel(sequelize) {
  return sequelize.define("vehicles", {
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
    brand: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    model: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    km: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    transmission: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    engine: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    color: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("available", "reserved", "sold"),
      allowNull: false,
      defaultValue: "available",
    },
    description: {
      type: DataTypes.TEXT,
    },
    image: {
      type: DataTypes.STRING(20),
      defaultValue: "🚗",
    },
    imageUrls: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      field: "image_urls",
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },
    outboundPriority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "outbound_priority",
    },
  });
}
