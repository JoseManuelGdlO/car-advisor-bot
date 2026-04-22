import { DataTypes } from "sequelize";

export default function BotSessionModel(sequelize) {
  return sequelize.define("bot_sessions", {
    sessionId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      field: "session_id",
    },
    phone: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    platform: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "web",
    },
    conversationId: {
      type: DataTypes.UUID,
      field: "conversation_id",
    },
    statePayload: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
      field: "state_payload",
    },
    payloadVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: "payload_version",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "expires_at",
    },
  });
}
