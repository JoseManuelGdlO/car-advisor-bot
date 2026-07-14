import { DataTypes } from "sequelize";

export default function OwnerNotificationModel(sequelize) {
  return sequelize.define("owner_notifications", {
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
    title: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    body: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    kind: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    conversationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "conversation_id",
    },
    data: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "read_at",
    },
  });
}
