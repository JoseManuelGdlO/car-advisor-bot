import { apiRequest } from "@/lib/api";

export type IntegrationChannel = "whatsapp" | "facebook" | "telegram" | "web" | "api" | "instagram";

export type IntegrationDto = {
  id: string;
  channel: IntegrationChannel;
  provider: string;
  displayName: string | null;
  status: "draft" | "active" | "error" | "disabled";
  webhookUrl: string | null;
  lastHealthcheckAt: string | null;
  lastError: string | null;
  hasActiveCredential: boolean;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  displayPhoneNumber?: string | null;
  coexistenceEnabled?: boolean;
};

export type MetaSignupConfigDto = {
  configured: boolean;
  appId: string;
  configId: string;
  graphVersion: string;
  featureType: string;
  sessionInfoVersion: string;
};

export type MetaSignupTicketDto = {
  ticket: string;
  expiresAt: string;
  signupUrl: string;
};

export type MetaSignupTicketStatusDto = {
  status: "pending" | "completed" | "failed" | "cancelled";
  message: string;
};

export type WhatsAppMetaStatusDto = {
  provider: "meta";
  configured: boolean;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
};

export type WhatsAppQrLinkDto = {
  url: string;
  expiresAt: string;
};

export type WhatsAppDeviceStatusDto = {
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  updatedAt: string;
};

export type FollowupTemplateDto = {
  id: string;
  name: string;
  displayName: string | null;
  body: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED";
  rejectedReason: string | null;
  language: string;
  category: string;
  lastStatusAt: string | null;
};

export type FollowupTemplateResponse = {
  metaConnected: boolean;
  template: FollowupTemplateDto | null;
};

export const integrationsApi = {
  list: (token: string) => apiRequest<IntegrationDto[]>("/integrations", "GET", undefined, token),
  create: (
    token: string,
    body: { channel: IntegrationChannel; provider?: string; displayName?: string | null; status?: IntegrationDto["status"]; webhookUrl?: string | null }
  ) => apiRequest<IntegrationDto>("/integrations", "POST", body, token),
  patch: (token: string, id: string, body: Partial<Pick<IntegrationDto, "displayName" | "status" | "webhookUrl">>) =>
    apiRequest<IntegrationDto>(`/integrations/${id}`, "PATCH", body, token),
  remove: (token: string, id: string) => apiRequest<{ ok: boolean }>(`/integrations/${id}`, "DELETE", undefined, token),
  postCredentials: (token: string, id: string, payload: Record<string, unknown>) =>
    apiRequest<{ ok: boolean; hasActiveCredential: boolean }>(`/integrations/${id}/credentials`, "POST", { payload }, token),
  test: (token: string, id: string) => apiRequest<{ ok: boolean; message: string }>(`/integrations/${id}/test`, "POST", {}, token),
  // DEPRECATED WhatsApp Connect
  // createWhatsAppQrLink: (token: string, integrationId: string) =>
  //   apiRequest<WhatsAppQrLinkDto>("/internal/whatsapp/qr-link", "POST", { integrationId }, token),
  // getWhatsAppDeviceStatus: (token: string, integrationId: string) =>
  //   apiRequest<WhatsAppDeviceStatusDto>(`/internal/whatsapp/device-status?integrationId=${encodeURIComponent(integrationId)}`, "GET", undefined, token),
  // sendWhatsAppTest: (token: string, body: { integrationId: string; to: string; text: string }) =>
  //   apiRequest<{ ok: boolean }>("/internal/whatsapp/send-test", "POST", body, token),
  getMetaSignupConfig: (token: string) =>
    apiRequest<MetaSignupConfigDto>("/integrations/whatsapp/meta/config", "GET", undefined, token),
  createMetaSignupTicket: (token: string) =>
    apiRequest<MetaSignupTicketDto>("/integrations/whatsapp/meta/signup-ticket", "POST", {}, token),
  getMetaSignupTicketStatus: (token: string, ticket: string) =>
    apiRequest<MetaSignupTicketStatusDto>(
      `/integrations/whatsapp/meta/signup-ticket?ticket=${encodeURIComponent(ticket)}`,
      "GET",
      undefined,
      token,
    ),
  completeMetaSignup: (
    token: string,
    body: {
      code: string;
      wabaId?: string | null;
      phoneNumberId?: string | null;
      businessId?: string | null;
      event?: string | null;
    },
  ) => apiRequest<IntegrationDto>("/integrations/whatsapp/meta/signup", "POST", body, token),
  disconnectMetaWhatsapp: (token: string) =>
    apiRequest<{ ok: boolean }>("/integrations/whatsapp/meta/disconnect", "POST", {}, token),
  getWhatsAppMetaStatus: (token: string) =>
    apiRequest<WhatsAppMetaStatusDto>("/internal/whatsapp/meta/status", "GET", undefined, token),
  sendWhatsAppCloudTest: (token: string, body: { to: string; text: string }) =>
    apiRequest<{ ok: boolean }>("/internal/whatsapp/send-test", "POST", body, token),
  getFollowupTemplate: (token: string) =>
    apiRequest<FollowupTemplateResponse>("/integrations/whatsapp/meta/templates/followup", "GET", undefined, token),
  createFollowupTemplate: (token: string, body: { body: string }) =>
    apiRequest<FollowupTemplateDto>("/integrations/whatsapp/meta/templates/followup", "POST", body, token),
  updateFollowupTemplate: (token: string, body: { body: string }) =>
    apiRequest<FollowupTemplateDto>("/integrations/whatsapp/meta/templates/followup", "PUT", body, token),
};
