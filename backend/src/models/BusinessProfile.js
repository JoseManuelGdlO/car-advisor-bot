import { DataTypes } from "sequelize";

export default function BusinessProfileModel(sequelize) {
  return sequelize.define("business_profiles", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ownerUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: "owner_user_id",
    },
    tradeName: {
      type: DataTypes.STRING(200),
      field: "trade_name",
    },
    legalName: {
      type: DataTypes.STRING(200),
      field: "legal_name",
    },
    taxId: {
      type: DataTypes.STRING(64),
      field: "tax_id",
    },
    businessPhone: {
      type: DataTypes.STRING(40),
      field: "business_phone",
    },
    businessEmail: {
      type: DataTypes.STRING(190),
      field: "business_email",
    },
    website: {
      type: DataTypes.STRING(500),
    },
    addressLine: {
      type: DataTypes.STRING(255),
      field: "address_line",
    },
    city: {
      type: DataTypes.STRING(120),
    },
    state: {
      type: DataTypes.STRING(120),
    },
    country: {
      type: DataTypes.STRING(120),
    },
    description: {
      type: DataTypes.TEXT,
    },
    logoUrl: {
      type: DataTypes.STRING(500),
      field: "logo_url",
    },
  });
}
