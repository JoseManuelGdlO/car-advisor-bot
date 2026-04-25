import { sequelize } from "../config/database.js";
import UserModel from "./User.js";
import ServiceTokenModel from "./ServiceToken.js";
import BotSettingModel from "./BotSetting.js";
import BusinessProfileModel from "./BusinessProfile.js";
import ChannelIntegrationModel from "./ChannelIntegration.js";
import ChannelCredentialModel from "./ChannelCredential.js";
import VehicleModel from "./Vehicle.js";
import ClientLeadModel from "./ClientLead.js";
import ConversationModel from "./Conversation.js";
import MessageModel from "./Message.js";
import BotSessionModel from "./BotSession.js";
import FaqModel from "./Faq.js";
import PromotionModel from "./Promotion.js";
import FinancingPlanModel from "./FinancingPlan.js";
import FinancingRequirementModel from "./FinancingRequirement.js";
import VehicleFinancingPlanModel from "./VehicleFinancingPlan.js";
import FinancingPlanRequirementModel from "./FinancingPlanRequirement.js";
import PushDeviceModel from "./PushDevice.js";

export const User = UserModel(sequelize);
export const ServiceToken = ServiceTokenModel(sequelize);
export const BotSetting = BotSettingModel(sequelize);
export const BusinessProfile = BusinessProfileModel(sequelize);
export const ChannelIntegration = ChannelIntegrationModel(sequelize);
export const ChannelCredential = ChannelCredentialModel(sequelize);
export const Vehicle = VehicleModel(sequelize);
export const ClientLead = ClientLeadModel(sequelize);
export const Conversation = ConversationModel(sequelize);
export const Message = MessageModel(sequelize);
export const BotSession = BotSessionModel(sequelize);
export const Faq = FaqModel(sequelize);
export const Promotion = PromotionModel(sequelize);
export const FinancingPlan = FinancingPlanModel(sequelize);
export const FinancingRequirement = FinancingRequirementModel(sequelize);
export const VehicleFinancingPlan = VehicleFinancingPlanModel(sequelize);
export const FinancingPlanRequirement = FinancingPlanRequirementModel(sequelize);
export const PushDevice = PushDeviceModel(sequelize);

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

User.hasMany(PushDevice, {
  foreignKey: { name: "ownerUserId", field: "owner_user_id", allowNull: false },
  sourceKey: "id",
  as: "pushDevices",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
PushDevice.belongsTo(User, {
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
