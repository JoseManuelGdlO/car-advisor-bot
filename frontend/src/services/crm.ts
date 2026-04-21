import { apiRequest, apiRequestFormData } from "@/lib/api";

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
};

export const crmApi = {
  getKpis: (token: string) => apiRequest("/dashboard/kpis", "GET", undefined, token),
  getClients: (token: string) => apiRequest("/clients", "GET", undefined, token),
  getClient: (token: string, id: string) => apiRequest(`/clients/${id}`, "GET", undefined, token),
  getConversations: (token: string) => apiRequest("/conversations", "GET", undefined, token),
  getConversationMessages: (token: string, id: string) => apiRequest(`/conversations/${id}/messages`, "GET", undefined, token),
  getBotSettings: (token: string) => apiRequest<BotSettingsDto>("/bot/settings", "GET", undefined, token),
  updateBotSettings: (token: string, payload: Partial<BotSettingsDto>) => apiRequest<BotSettingsDto>("/bot/settings", "PATCH", payload, token),
  getVehicles: (token: string) => apiRequest("/vehicles", "GET", undefined, token),
  createVehicle: (
    token: string,
    payload: {
      brand: string;
      model: string;
      year: number;
      price: number;
      km: number;
      transmission: string;
      engine: string;
      color: string;
      status?: "available" | "reserved" | "sold";
      description?: string;
      image?: string;
      imageUrls?: string[];
      metadata?: Record<string, string | number | boolean>;
      outboundPriority?: number;
    }
  ) => apiRequest("/vehicles", "POST", payload, token),
  updateVehicle: (
    token: string,
    id: string,
    payload: {
      brand: string;
      model: string;
      year: number;
      price: number;
      km: number;
      transmission: string;
      engine: string;
      color: string;
      status?: "available" | "reserved" | "sold";
      description?: string;
      image?: string;
      imageUrls?: string[];
      metadata?: Record<string, string | number | boolean>;
      outboundPriority?: number;
    }
  ) => apiRequest(`/vehicles/${id}`, "PATCH", payload, token),
  uploadVehicleImages: async (token: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append("images", file));
    return apiRequestFormData<{ imageUrls: string[] }>("/vehicles/images/upload", formData, token);
  },
  getFaqs: (token: string) => apiRequest("/faqs", "GET", undefined, token),
  createFaq: (token: string, payload: { question: string; answer: string }) => apiRequest("/faqs", "POST", payload, token),
  updateFaq: (token: string, id: string, payload: { question: string; answer: string }) =>
    apiRequest(`/faqs/${id}`, "PATCH", payload, token),
  deleteFaq: (token: string, id: string) => apiRequest(`/faqs/${id}`, "DELETE", undefined, token),
  getPromotions: (token: string) => apiRequest("/promotions", "GET", undefined, token),
  createPromotion: (
    token: string,
    payload: { title: string; description: string; validUntil?: string; appliesTo?: string; active?: boolean; vehicleIds?: string[] }
  ) => apiRequest("/promotions", "POST", payload, token),
  updatePromotion: (
    token: string,
    id: string,
    payload: { title: string; description: string; validUntil?: string; appliesTo?: string; active?: boolean; vehicleIds?: string[] }
  ) => apiRequest(`/promotions/${id}`, "PATCH", payload, token),
  togglePromotion: (token: string, id: string) => apiRequest(`/promotions/${id}/toggle`, "POST", {}, token),
  getFinancingPlans: (token: string) => apiRequest("/financing-plans", "GET", undefined, token),
  createFinancingPlan: (token: string, payload: Partial<FinancingPlanDto>) =>
    apiRequest("/financing-plans", "POST", payload, token),
  updateFinancingPlan: (token: string, id: string, payload: Partial<FinancingPlanDto>) =>
    apiRequest(`/financing-plans/${id}`, "PATCH", payload, token),
  deleteFinancingPlan: (token: string, id: string) => apiRequest(`/financing-plans/${id}`, "DELETE", undefined, token),
  getFinancingRequirements: (token: string) => apiRequest("/financing-requirements", "GET", undefined, token),
  createFinancingRequirement: (token: string, payload: Partial<FinancingRequirementDto>) =>
    apiRequest("/financing-requirements", "POST", payload, token),
  updateFinancingRequirement: (token: string, id: string, payload: Partial<FinancingRequirementDto>) =>
    apiRequest(`/financing-requirements/${id}`, "PATCH", payload, token),
  deleteFinancingRequirement: (token: string, id: string) =>
    apiRequest(`/financing-requirements/${id}`, "DELETE", undefined, token),
  assignPlanToVehicle: (token: string, vehicleId: string, planId: string, customRate?: number) =>
    apiRequest(`/vehicles/${vehicleId}/financing-plans/${planId}`, "POST", customRate === undefined ? {} : { customRate }, token),
  removePlanFromVehicle: (token: string, vehicleId: string, planId: string) =>
    apiRequest(`/vehicles/${vehicleId}/financing-plans/${planId}`, "DELETE", undefined, token),
  assignRequirementToPlan: (token: string, planId: string, requirementId: string) =>
    apiRequest(`/financing-plans/${planId}/requirements/${requirementId}`, "POST", {}, token),
  removeRequirementFromPlan: (token: string, planId: string, requirementId: string) =>
    apiRequest(`/financing-plans/${planId}/requirements/${requirementId}`, "DELETE", undefined, token),
};
