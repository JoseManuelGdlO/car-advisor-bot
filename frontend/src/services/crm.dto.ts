import type { Channel, ClientStatus } from "@/data/mockData";

export type FinancingRequirementDto = {
  id: string;
  title: string;
  description: string;
  ownerUserId: string;
};

export type FinancingPlanDto = {
  id: string;
  name: string;
  lender: string;
  rate: number;
  maxTermMonths: number;
  active: boolean;
  showRate: boolean;
  requirements?: FinancingRequirementDto[];
  vehicles?: { id: string; brand: string; model: string; year: number }[];
};

export type PromotionDto = {
  id: string;
  title: string;
  description: string;
  validUntil?: string;
  appliesTo?: string;
  active: boolean;
  vehicleIds?: string[];
};

export type VehicleDto = {
  id: string;
  brand: string;
  model: string;
  year: number;
  price: number;
  km: number;
  transmission: string;
  engine: string;
  color: string;
  description?: string;
  status: "available" | "reserved" | "sold";
  image: string;
  imageUrls?: string[];
  metadata?: Record<string, string | number | boolean>;
  outboundPriority?: number;
  financingPlans?: (FinancingPlanDto & { vehicle_financing_plans?: { customRate: number | null } })[];
};

export type BotScheduleRangeDto = {
  start: string;
  end: string;
};

export type BotWeeklyScheduleDto = {
  monday: BotScheduleRangeDto[];
  tuesday: BotScheduleRangeDto[];
  wednesday: BotScheduleRangeDto[];
  thursday: BotScheduleRangeDto[];
  friday: BotScheduleRangeDto[];
  saturday: BotScheduleRangeDto[];
  sunday: BotScheduleRangeDto[];
};

export type BotSettingsDto = {
  isEnabled: boolean;
  timezone: string;
  weeklySchedule: BotWeeklyScheduleDto;
  tone: "formal" | "cercano" | "vendedor" | "tecnico";
  emojiStyle: "nunca" | "pocos" | "frecuentes";
  salesProactivity: "bajo" | "medio" | "alto";
  customInstructions: string;
};

export type DashboardKpisDto = {
  activeChats: number;
  newToday: number;
  waiting: number;
  newLeads: number;
  newLeadsChange: number;
  conversions: number;
  conversionsChange: number;
  weeklyChats: number[];
  topProducts: Array<{ name: string; queries: number }>;
};

export type ClientDto = {
  id: string;
  name: string;
  phone: string;
  channel: Channel;
  status: ClientStatus;
  interestedIn: string;
  lastMessage: string;
  lastMessageAt: string;
  notes: string;
  avatarColor: string;
};

export type ConversationMessageDto = {
  id: string;
  from: "client" | "bot" | "seller";
  text: string;
  time: string;
};

export type ConversationDto = {
  id: string;
  channel: Channel;
  unread: number;
  lastMessage: string;
  lastTime: string;
  // Backward-compatible identifiers seen in different screens/contracts.
  clientId?: string;
  clientLeadId?: string;
  client?: {
    id: string;
    name: string;
    phone?: string;
    avatarColor?: string;
    interestedIn?: string;
  };
  isHumanControlled?: boolean;
  messages?: ConversationMessageDto[];
};
