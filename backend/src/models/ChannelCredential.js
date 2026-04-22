import { DataTypes } from "sequelize";

export default function ChannelCredentialModel(sequelize) {
  return sequelize.define("channel_credentials", {
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
    credentialType: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: "json_secrets",
      field: "credential_type",
    },
    cipherText: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
      field: "cipher_text",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_active",
    },
  });
}
