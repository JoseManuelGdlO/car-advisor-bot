import { DataTypes } from "sequelize";

export default function FinancingPlanRequirementModel(sequelize) {
  return sequelize.define(
    "financing_plan_requirements",
    {
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
      financingPlanId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "financing_plan_id",
      },
      financingRequirementId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "financing_requirement_id",
      },
    },
    {
      indexes: [
        {
          name: "uniq_plan_req",
          unique: true,
          fields: ["financing_plan_id", "financing_requirement_id"],
        },
      ],
    }
  );
}
