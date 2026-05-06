import { apiRequest, apiRequestFormData } from "@/lib/api";
import type {
  BotSettingsDto,
  ClientDto,
  ConversationDto,
  ConversationMessageDto,
  DashboardKpisDto,
  FinancingPlanDto,
  FinancingRequirementDto,
} from "./crm.dto";
export type {
  BotScheduleRangeDto,
  BotSettingsDto,
  BotWeeklyScheduleDto,
  ClientDto,
  ConversationDto,
  ConversationMessageDto,
  DashboardKpisDto,
  FinancingPlanDto,
  FinancingRequirementDto,
  VehicleDto,
} from "./crm.dto";

export const crmApi = {
  getKpis: (token: string) => apiRequest<DashboardKpisDto>("/dashboard/kpis", "GET", undefined, token),
  getClients: (token: string) => apiRequest<ClientDto[]>("/clients", "GET", undefined, token),
  getClient: (token: string, id: string) => apiRequest<ClientDto>(`/clients/${id}`, "GET", undefined, token),
  getConversations: (token: string) => apiRequest<ConversationDto[]>("/conversations", "GET", undefined, token),
  getConversationMessages: (token: string, id: string) =>
    apiRequest<ConversationMessageDto[]>(`/conversations/${id}/messages`, "GET", undefined, token),
  sendConversationMessage: (token: string, id: string, payload: { text: string }) =>
    apiRequest(`/conversations/${id}/messages`, "POST", payload, token),
  sendConversationAttachment: (token: string, id: string, file: File, caption?: string) => {
    const formData = new FormData();
    formData.append("attachment", file);
    if (caption?.trim()) formData.append("caption", caption.trim());
    return apiRequestFormData(`/conversations/${id}/attachments`, formData, token);
  },
  setConversationControl: (token: string, id: string, payload: { isHumanControlled: boolean }) =>
    apiRequest(`/conversations/${id}/control`, "PATCH", payload, token),
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
