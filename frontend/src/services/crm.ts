import { apiRequest } from "@/lib/api";

export const crmApi = {
  getKpis: (token: string) => apiRequest("/dashboard/kpis", "GET", undefined, token),
  getClients: (token: string) => apiRequest("/clients", "GET", undefined, token),
  getClient: (token: string, id: string) => apiRequest(`/clients/${id}`, "GET", undefined, token),
  getConversations: (token: string) => apiRequest("/conversations", "GET", undefined, token),
  getConversationMessages: (token: string, id: string) => apiRequest(`/conversations/${id}/messages`, "GET", undefined, token),
  getVehicles: (token: string) => apiRequest("/vehicles", "GET", undefined, token),
  getFaqs: (token: string) => apiRequest("/faqs", "GET", undefined, token),
  getPromotions: (token: string) => apiRequest("/promotions", "GET", undefined, token),
  togglePromotion: (token: string, id: string) => apiRequest(`/promotions/${id}/toggle`, "POST", {}, token),
};
