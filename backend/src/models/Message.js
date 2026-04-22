import { DataTypes } from "sequelize";

export default function MessageModel(sequelize) {
  return sequelize.define("messages", {
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
    conversationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "conversation_id",
    },
    from: {
      type: DataTypes.ENUM("client", "bot", "seller", "user", "assistant", "system"),
      allowNull: false,
      defaultValue: "client",
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    time: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "",
    },
    phone: {
      type: DataTypes.STRING(32),
    },
    platform: {
      type: DataTypes.STRING(20),
    },
  });
}
