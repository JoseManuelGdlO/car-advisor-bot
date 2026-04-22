import { DataTypes } from "sequelize";

export default function FinancingPlanModel(sequelize) {
  return sequelize.define("financing_plans", {
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
    name: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    lender: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    rate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },
    maxTermMonths: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "max_term_months",
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    showRate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "show_rate",
    },
  });
}
