import { DataTypes } from "sequelize";

export default function ChannelIntegrationModel(sequelize) {
  return sequelize.define("channel_integrations", {
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
    channel: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    provider: {
      type: DataTypes.STRING(60),
      allowNull: false,
      defaultValue: "meta",
    },
    displayName: {
      type: DataTypes.STRING(160),
      field: "display_name",
    },
    status: {
      type: DataTypes.ENUM("draft", "active", "error", "disabled"),
      allowNull: false,
      defaultValue: "draft",
    },
    webhookUrl: {
      type: DataTypes.STRING(500),
      field: "webhook_url",
    },
    lastHealthcheckAt: {
      type: DataTypes.DATE,
      field: "last_healthcheck_at",
    },
    lastError: {
      type: DataTypes.TEXT,
      field: "last_error",
    },
  });
}
