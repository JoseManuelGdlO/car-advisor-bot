import { DataTypes } from "sequelize";

export default function ConversationModel(sequelize) {
  return sequelize.define("conversations", {
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
    clientLeadId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "client_lead_id",
    },
    channel: {
      type: DataTypes.ENUM("whatsapp", "facebook", "telegram", "web", "api", "instagram"),
      allowNull: false,
      defaultValue: "web",
    },
    unread: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    lastMessage: {
      type: DataTypes.TEXT,
      field: "last_message",
    },
    lastTime: {
      type: DataTypes.DATE,
      field: "last_time",
    },
    isHumanControlled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "is_human_controlled",
    },
    handoffAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "handoff_at",
    },
    handoffByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "handoff_by_user_id",
    },
    lastReminderAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "last_reminder_at",
    },
  });
}
