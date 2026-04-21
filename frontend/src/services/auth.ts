import { apiRequest } from "@/lib/api";

export type ServiceTokenRow = {
  id: string;
  name: string;
  scopes: string[];
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export const authApi = {
  listServiceTokens: (token: string) => apiRequest<ServiceTokenRow[]>("/auth/service-tokens", "GET", undefined, token),
  createServiceToken: (token: string, name: string) => apiRequest<{ id: string; token: string; name: string }>("/auth/service-tokens", "POST", { name }, token),
  revokeServiceToken: (token: string, id: string) => apiRequest<{ ok: boolean }>(`/auth/service-tokens/${id}/revoke`, "POST", {}, token),
};
