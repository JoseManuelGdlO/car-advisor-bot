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
      type: DataTypes.ENUM("whatsapp", "facebook", "telegram", "web", "api"),
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
  });
}
