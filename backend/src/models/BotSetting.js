import { DataTypes } from "sequelize";

export default function BotSettingModel(sequelize) {
  return sequelize.define("bot_settings", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ownerUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: "owner_user_id",
    },
    isEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_enabled",
    },
    timezone: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: "America/Bogota",
    },
    weeklySchedule: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
      field: "weekly_schedule",
    },
    tone: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "cercano",
    },
    emojiStyle: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "pocos",
      field: "emoji_style",
    },
    salesProactivity: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "medio",
      field: "sales_proactivity",
    },
    customInstructions: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
      field: "custom_instructions",
    },
  });
}
