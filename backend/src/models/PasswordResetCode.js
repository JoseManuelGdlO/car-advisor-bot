import { DataTypes } from "sequelize";

export default function PasswordResetCodeModel(sequelize) {
  return sequelize.define(
    "password_reset_codes",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: "user_id",
      },
      codeHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: "code_hash",
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "expires_at",
      },
      usedAt: {
        type: DataTypes.DATE,
        field: "used_at",
      },
      attemptCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: "attempt_count",
      },
    },
    {
      indexes: [
        {
          name: "idx_password_reset_codes_user_active",
          fields: ["user_id", "used_at", "expires_at"],
        },
      ],
    },
  );
}
