import { DataTypes } from "sequelize";

export default function ClientLeadModel(sequelize) {
  return sequelize.define("client_leads", {
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
    phone: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    channel: {
      type: DataTypes.ENUM("whatsapp", "facebook", "telegram", "web", "api"),
      allowNull: false,
      defaultValue: "web",
    },
    status: {
      type: DataTypes.ENUM("lead", "negotiation", "sold", "lost"),
      allowNull: false,
      defaultValue: "lead",
    },
    interestedIn: {
      type: DataTypes.STRING(160),
      field: "interested_in",
    },
    lastMessage: {
      type: DataTypes.TEXT,
      field: "last_message",
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      field: "last_message_at",
    },
    notes: {
      type: DataTypes.TEXT,
    },
    avatarColor: {
      type: DataTypes.STRING(40),
      field: "avatar_color",
      defaultValue: "hsl(142 70% 49%)",
    },
  });
}
