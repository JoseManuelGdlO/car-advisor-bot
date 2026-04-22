import { DataTypes } from "sequelize";

export default function ServiceTokenModel(sequelize) {
  return sequelize.define("service_tokens", {
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
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    tokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: "token_hash",
      unique: true,
    },
    scopes: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: ["bot:write"],
    },
    revokedAt: {
      type: DataTypes.DATE,
      field: "revoked_at",
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      field: "last_used_at",
    },
  });
}
