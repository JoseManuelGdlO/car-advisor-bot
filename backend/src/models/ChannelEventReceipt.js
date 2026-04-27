import { DataTypes } from "sequelize";

export default function ChannelEventReceiptModel(sequelize) {
  // Registro de eventos entrantes para idempotencia y troubleshooting operativo.
  return sequelize.define("channel_event_receipts", {
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
    channelIntegrationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "channel_integration_id",
    },
    provider: {
      type: DataTypes.STRING(60),
      allowNull: false,
    },
    providerEventId: {
      type: DataTypes.STRING(120),
      allowNull: false,
      field: "provider_event_id",
    },
    eventType: {
      type: DataTypes.STRING(80),
      allowNull: true,
      field: "event_type",
    },
    receivedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "received_at",
      defaultValue: DataTypes.NOW,
    },
    status: {
      type: DataTypes.ENUM("accepted", "processed", "ignored", "failed"),
      allowNull: false,
      defaultValue: "accepted",
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  });
}
