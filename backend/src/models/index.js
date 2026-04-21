import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export const User = sequelize.define("users", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  email: { type: DataTypes.STRING(190), allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: "password_hash" },
  name: { type: DataTypes.STRING(120), allowNull: false },
  phone: { type: DataTypes.STRING(32) },
  defaultPlatform: { type: DataTypes.STRING(20), field: "default_platform" },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
});

export const ServiceToken = sequelize.define("service_tokens", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerUserId: { type: DataTypes.UUID, allowNull: false, field: "owner_user_id" },
  name: { type: DataTypes.STRING(120), allowNull: false },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, field: "token_hash", unique: true },
  scopes: { type: DataTypes.JSON, allowNull: false, defaultValue: ["bot:write"] },
  revokedAt: { type: DataTypes.DATE, field: "revoked_at" },
  lastUsedAt: { type: DataTypes.DATE, field: "last_used_at" },
});

export const BotSetting = sequelize.define("bot_settings", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerUserId: { type: DataTypes.UUID, allowNull: false, unique: true, field: "owner_user_id" },
  isEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: "is_enabled" },
  timezone: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "America/Bogota" },
  weeklySchedule: { type: DataTypes.JSON, allowNull: false, defaultValue: {}, field: "weekly_schedule" },
});

export const BusinessProfile = sequelize.define("business_profiles", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerUserId: { type: DataTypes.UUID, allowNull: false, unique: true, field: "owner_user_id" },
  tradeName: { type: DataTypes.STRING(200), field: "trade_name" },
  legalName: { type: DataTypes.STRING(200), field: "legal_name" },
  taxId: { type: DataTypes.STRING(64), field: "tax_id" },
  businessPhone: { type: DataTypes.STRING(40), field: "business_phone" },
  businessEmail: { type: DataTypes.STRING(190), field: "business_email" },
  website: { type: DataTypes.STRING(500) },
  addressLine: { type: DataTypes.STRING(255), field: "address_line" },
  city: { type: DataTypes.STRING(120) },
  state: { type: DataTypes.STRING(120) },
  country: { type: DataTypes.STRING(120) },
  description: { type: DataTypes.TEXT },
  logoUrl: { type: DataTypes.STRING(500), field: "logo_url" },
});

export const ChannelIntegration = sequelize.define("channel_integrations", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerUserId: { type: DataTypes.UUID, allowNull: false, field: "owner_user_id" },
  channel: { type: DataTypes.STRING(32), allowNull: false },
  provider: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "meta" },
  displayName: { type: DataTypes.STRING(160), field: "display_name" },
  status: { type: DataTypes.ENUM("draft", "active", "error", "disabled"), allowNull: false, defaultValue: "draft" },
  webhookUrl: { type: DataTypes.STRING(500), field: "webhook_url" },
  lastHealthcheckAt: { type: DataTypes.DATE, field: "last_healthcheck_at" },
  lastError: { type: DataTypes.TEXT, field: "last_error" },
});

export const ChannelCredential = sequelize.define("channel_credentials", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerUserId: { type: DataTypes.UUID, allowNull: false, field: "owner_user_id" },
  channelIntegrationId: { type: DataTypes.UUID, allowNull: false, field: "channel_integration_id" },
  credentialType: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "json_secrets", field: "credential_type" },
  cipherText: { type: DataTypes.TEXT("long"), allowNull: false, field: "cipher_text" },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: "is_active" },
});

export const Vehicle = sequelize.define("vehicles", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerUserId: { type: DataTypes.UUID, allowNull: false, field: "owner_user_id" },
  brand: { type: DataTypes.STRING(80), allowNull: false },
  model: { type: DataTypes.STRING(80), allowNull: false },
  year: { type: DataTypes.INTEGER, allowNull: false },
  price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  km: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  transmission: { type: DataTypes.STRING(40), allowNull: false },
  engine: { type: DataTypes.STRING(80), allowNull: false },
  color: { type: DataTypes.STRING(80), allowNull: false },
  status: { type: DataTypes.ENUM("available", "reserved", "sold"), allowNull: false, defaultValue: "available" },
  description: { type: DataTypes.TEXT },
  image: { type: DataTypes.STRING(20), defaultValue: "🚗" },
  imageUrls: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: "image_urls" },
  metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  outboundPriority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "outbound_priority" },
});

export const ClientLead = sequelize.define("client_leads", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerUserId: { type: DataTypes.UUID, allowNull: false, field: "owner_user_id" },
  name: { type: DataTypes.STRING(120), allowNull: false },
  phone: { type: DataTypes.STRING(40), allowNull: false },
  channel: { type: DataTypes.ENUM("whatsapp", "facebook", "telegram", "web", "api"), allowNull: false, defaultValue: "web" },
  status: { type: DataTypes.ENUM("lead", "negotiation", "sold", "lost"), allowNull: false, defaultValue: "lead" },
  interestedIn: { type: DataTypes.STRING(160), field: "interested_in" },
  lastMessage: { type: DataTypes.TEXT, field: "last_message" },
  lastMessageAt: { type: DataTypes.DATE, field: "last_message_at" },
  notes: { type: DataTypes.TEXT },
  avatarColor: { type: DataTypes.STRING(40), field: "avatar_color", defaultValue: "hsl(142 70% 49%)" },
});

export const Conversation = sequelize.define("conversations", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerUserId: { type: DataTypes.UUID, allowNull: false, field: "owner_user_id" },
  clientLeadId: { type: DataTypes.UUID, allowNull: false, field: "client_lead_id" },
  channel: { type: DataTypes.ENUM("whatsapp", "facebook", "telegram", "web", "api"), allowNull: false, defaultValue: "web" },
  unread: { type: DataTypes.INTEGER, defaultValue: 0 },
  lastMessage: { type: DataTypes.TEXT, field: "last_message" },
  lastTime: { type: DataTypes.DATE, field: "last_time" },
});

export const Message = sequelize.define("messages", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerUserId: { type: DataTypes.UUID, allowNull: false, field: "owner_user_id" },
  conversationId: { type: DataTypes.UUID, allowNull: false, field: "conversation_id" },
  // "from" is also used as the bot sender role (user/assistant/system).
  from: { type: DataTypes.ENUM("client", "bot", "seller", "user", "assistant", "system"), allowNull: false, defaultValue: "client" },
  text: { type: DataTypes.TEXT, allowNull: false },
  time: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "" },
  phone: { type: DataTypes.STRING(32) },
  platform: { type: DataTypes.STRING(20) },
});

export const BotSession = sequelize.define("bot_sessions", {
  sessionId: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, field: "session_id" },
  phone: { type: DataTypes.STRING(32), allowNull: false },
  platform: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "web" },
  conversationId: { type: DataTypes.UUID, field: "conversation_id" },
  statePayload: { type: DataTypes.TEXT("long"), allowNull: false, field: "state_payload" },
  payloadVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: "payload_version" },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: "expires_at" },
});

export const Faq = sequelize.define("faqs", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerUserId: { type: DataTypes.UUID, allowNull: false, field: "owner_user_id" },
  question: { type: DataTypes.STRING(255), allowNull: false },
  answer: { type: DataTypes.TEXT, allowNull: false },
});

export const Promotion = sequelize.define("promotions", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerUserId: { type: DataTypes.UUID, allowNull: false, field: "owner_user_id" },
  title: { type: DataTypes.STRING(160), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  validUntil: { type: DataTypes.STRING(40), field: "valid_until" },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  appliesTo: { type: DataTypes.STRING(160), field: "applies_to" },
  vehicleIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: "vehicle_ids" },
});

export const FinancingPlan = sequelize.define("financing_plans", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerUserId: { type: DataTypes.UUID, allowNull: false, field: "owner_user_id" },
  name: { type: DataTypes.STRING(160), allowNull: false },
  lender: { type: DataTypes.STRING(120), allowNull: false },
  rate: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
  maxTermMonths: { type: DataTypes.INTEGER, allowNull: false, field: "max_term_months" },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  showRate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: "show_rate" },
});

export const FinancingRequirement = sequelize.define("financing_requirements", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerUserId: { type: DataTypes.UUID, allowNull: false, field: "owner_user_id" },
  title: { type: DataTypes.STRING(160), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
});

export const VehicleFinancingPlan = sequelize.define(
  "vehicle_financing_plans",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ownerUserId: { type: DataTypes.UUID, allowNull: false, field: "owner_user_id" },
    vehicleId: { type: DataTypes.UUID, allowNull: false, field: "vehicle_id" },
    financingPlanId: { type: DataTypes.UUID, allowNull: false, field: "financing_plan_id" },
    customRate: { type: DataTypes.DECIMAL(5, 2), field: "custom_rate" },
  },
  {
    indexes: [{ name: "uniq_vehicle_plan", unique: true, fields: ["vehicle_id", "financing_plan_id"] }],
  }
);

export const FinancingPlanRequirement = sequelize.define(
  "financing_plan_requirements",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ownerUserId: { type: DataTypes.UUID, allowNull: false, field: "owner_user_id" },
    financingPlanId: { type: DataTypes.UUID, allowNull: false, field: "financing_plan_id" },
    financingRequirementId: { type: DataTypes.UUID, allowNull: false, field: "financing_requirement_id" },
  },
  {
    indexes: [{ name: "uniq_plan_req", unique: true, fields: ["financing_plan_id", "financing_requirement_id"] }],
  }
);

User.hasMany(ServiceToken, {
  foreignKey: { name: "ownerUserId", field: "owner_user_id", allowNull: false },
  sourceKey: "id",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
ServiceToken.belongsTo(User, {
  foreignKey: { name: "ownerUserId", field: "owner_user_id", allowNull: false },
  targetKey: "id",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

User.hasOne(BotSetting, {
  foreignKey: { name: "ownerUserId", field: "owner_user_id", allowNull: false },
  sourceKey: "id",
  as: "botSetting",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
BotSetting.belongsTo(User, {
  foreignKey: { name: "ownerUserId", field: "owner_user_id", allowNull: false },
  targetKey: "id",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

User.hasOne(BusinessProfile, {
  foreignKey: { name: "ownerUserId", field: "owner_user_id", allowNull: false },
  sourceKey: "id",
  as: "businessProfile",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
BusinessProfile.belongsTo(User, {
  foreignKey: { name: "ownerUserId", field: "owner_user_id", allowNull: false },
  targetKey: "id",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

User.hasMany(ChannelIntegration, {
  foreignKey: { name: "ownerUserId", field: "owner_user_id", allowNull: false },
  sourceKey: "id",
  as: "channelIntegrations",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
ChannelIntegration.belongsTo(User, {
  foreignKey: { name: "ownerUserId", field: "owner_user_id", allowNull: false },
  targetKey: "id",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

ChannelIntegration.hasMany(ChannelCredential, {
  foreignKey: { name: "channelIntegrationId", field: "channel_integration_id", allowNull: false },
  sourceKey: "id",
  as: "credentials",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
ChannelCredential.belongsTo(ChannelIntegration, {
  foreignKey: { name: "channelIntegrationId", field: "channel_integration_id", allowNull: false },
  targetKey: "id",
  as: "integration",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

ClientLead.hasMany(Conversation, {
  foreignKey: { name: "clientLeadId", field: "client_lead_id", allowNull: false },
  sourceKey: "id",
  as: "conversations",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Conversation.belongsTo(ClientLead, {
  foreignKey: { name: "clientLeadId", field: "client_lead_id", allowNull: false },
  targetKey: "id",
  as: "client",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Conversation.hasMany(Message, {
  foreignKey: { name: "conversationId", field: "conversation_id", allowNull: false },
  sourceKey: "id",
  as: "messages",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Message.belongsTo(Conversation, {
  foreignKey: { name: "conversationId", field: "conversation_id", allowNull: false },
  targetKey: "id",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

Vehicle.belongsToMany(FinancingPlan, {
  through: VehicleFinancingPlan,
  foreignKey: { name: "vehicleId", field: "vehicle_id", allowNull: false },
  otherKey: { name: "financingPlanId", field: "financing_plan_id", allowNull: false },
  as: "financingPlans",
});
FinancingPlan.belongsToMany(Vehicle, {
  through: VehicleFinancingPlan,
  foreignKey: { name: "financingPlanId", field: "financing_plan_id", allowNull: false },
  otherKey: { name: "vehicleId", field: "vehicle_id", allowNull: false },
  as: "vehicles",
});

FinancingPlan.belongsToMany(FinancingRequirement, {
  through: FinancingPlanRequirement,
  foreignKey: { name: "financingPlanId", field: "financing_plan_id", allowNull: false },
  otherKey: { name: "financingRequirementId", field: "financing_requirement_id", allowNull: false },
  as: "requirements",
});
FinancingRequirement.belongsToMany(FinancingPlan, {
  through: FinancingPlanRequirement,
  foreignKey: { name: "financingRequirementId", field: "financing_requirement_id", allowNull: false },
  otherKey: { name: "financingPlanId", field: "financing_plan_id", allowNull: false },
  as: "plans",
});
