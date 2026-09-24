import { DataTypes } from "sequelize";

export default function WhatsappMessageTemplateModel(sequelize) {
  return sequelize.define(
    "whatsapp_message_templates",
    {
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
      wabaId: {
        type: DataTypes.STRING(40),
        allowNull: false,
        field: "waba_id",
      },
      metaTemplateId: {
        type: DataTypes.STRING(40),
        field: "meta_template_id",
      },
      name: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      displayName: {
        type: DataTypes.STRING(160),
        allowNull: false,
        field: "display_name",
      },
      language: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "es_MX",
      },
      category: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "MARKETING",
      },
      components: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("PENDING", "APPROVED", "REJECTED", "PAUSED", "DISABLED"),
        allowNull: false,
        defaultValue: "PENDING",
      },
      rejectedReason: {
        type: DataTypes.TEXT,
        field: "rejected_reason",
      },
      lastStatusAt: {
        type: DataTypes.DATE,
        field: "last_status_at",
      },
      purpose: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "followup",
      },
      isWabaDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: "is_waba_default",
      },
    },
    {
      indexes: [
        {
          name: "uniq_whatsapp_message_templates_waba_name",
          unique: true,
          fields: ["waba_id", "name"],
        },
      ],
    }
  );
}
