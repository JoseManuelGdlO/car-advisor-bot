import { DataTypes } from "sequelize";

export default function ChannelConversationContextModel(sequelize) {
  // Mantiene el enlace entre identidad externa y entidades internas CRM.
  return sequelize.define("channel_conversation_contexts", {
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
    externalUserId: {
      type: DataTypes.STRING(80),
      allowNull: false,
      field: "external_user_id",
    },
    channelIntegrationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "channel_integration_id",
    },
    deviceId: {
      type: DataTypes.STRING(80),
      allowNull: false,
      field: "device_id",
    },
    tenantId: {
      type: DataTypes.STRING(80),
      allowNull: true,
      field: "tenant_id",
    },
    conversationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "conversation_id",
    },
    clientLeadId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "client_lead_id",
    },
    lastProviderMessageId: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: "last_provider_message_id",
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "last_seen_at",
    },
  });
}
