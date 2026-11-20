import { DataTypes } from "sequelize";

export default function UserModel(sequelize) {
  return sequelize.define("users", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(190),
      allowNull: false,
      unique: true,
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "password_hash",
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(32),
    },
    defaultPlatform: {
      type: DataTypes.STRING(20),
      field: "default_platform",
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    // Nullable: los vendedores no tienen URL propia (el bot lee la del admin).
    calendarSchedulingUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: "calendar_scheduling_url",
    },
    role: {
      type: DataTypes.ENUM("admin", "seller"),
      allowNull: false,
      defaultValue: "admin",
    },
    // NULL para admin; obligatorio (id del admin) para seller.
    tenantOwnerUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "tenant_owner_user_id",
    },
    notifyAssignedLeadMessages: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "notify_assigned_lead_messages",
    },
    pushEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "push_enabled",
    },
    notifyLeadInterest: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "notify_lead_interest",
    },
    notifyEscalations: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "notify_escalations",
    },
    notifyInboundMessages: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "notify_inbound_messages",
    },
    autoAssignLeads: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "auto_assign_leads",
    },
    weeklySchedule: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      },
      field: "weekly_schedule",
    },
  });
}
