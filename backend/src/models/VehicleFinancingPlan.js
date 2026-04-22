import { DataTypes } from "sequelize";

export default function VehicleFinancingPlanModel(sequelize) {
  return sequelize.define(
    "vehicle_financing_plans",
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
      vehicleId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "vehicle_id",
      },
      financingPlanId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "financing_plan_id",
      },
      customRate: {
        type: DataTypes.DECIMAL(5, 2),
        field: "custom_rate",
      },
    },
    {
      indexes: [
        {
          name: "uniq_vehicle_plan",
          unique: true,
          fields: ["vehicle_id", "financing_plan_id"],
        },
      ],
    }
  );
}
