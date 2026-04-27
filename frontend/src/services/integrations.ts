import { apiRequest } from "@/lib/api";

export type IntegrationChannel = "whatsapp" | "facebook" | "telegram" | "web" | "api";

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
};

export type WhatsAppQrLinkDto = {
  url: string;
  expiresAt: string;
};

export const integrationsApi = {
  list: (token: string) => apiRequest<IntegrationDto[]>("/integrations", "GET", undefined, token),
  create: (
    token: string,
    body: { channel: IntegrationChannel; provider?: string; displayName?: string | null; status?: IntegrationDto["status"]; webhookUrl?: string | null }
  ) => apiRequest<IntegrationDto>("/integrations", "POST", body, token),
  patch: (token: string, id: string, body: Partial<Pick<IntegrationDto, "displayName" | "status" | "webhookUrl">>) =>
    apiRequest<IntegrationDto>(`/integrations/${id}`, "PATCH", body, token),
  postCredentials: (token: string, id: string, payload: Record<string, unknown>) =>
    apiRequest<{ ok: boolean; hasActiveCredential: boolean }>(`/integrations/${id}/credentials`, "POST", { payload }, token),
  test: (token: string, id: string) => apiRequest<{ ok: boolean; message: string }>(`/integrations/${id}/test`, "POST", {}, token),
  createWhatsAppQrLink: (token: string, integrationId: string) =>
    apiRequest<WhatsAppQrLinkDto>("/internal/whatsapp/qr-link", "POST", { integrationId }, token),
};
