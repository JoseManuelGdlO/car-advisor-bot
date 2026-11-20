import { apiRequest } from "@/lib/api";

export type SellerDto = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  role: "seller";
  createdAt: string | null;
  assignedLeadsCount?: number;
};

export type CreateSellerPayload = {
  name: string;
  email: string;
  password: string;
  phone?: string | null;
};

export type UpdateSellerPayload = Partial<CreateSellerPayload>;

export type DeactivateSellerResponse = {
  ok: boolean;
  seller: SellerDto;
  /** Cantidad de leads que quedaron sin asignar al dar de baja. */
  unassignedLeads: number;
};

export const sellersApi = {
  list: (token: string, options: { includeInactive?: boolean } = {}) =>
    apiRequest<SellerDto[]>(`/sellers${options.includeInactive ? "?includeInactive=1" : ""}`, "GET", undefined, token),
  create: (token: string, payload: CreateSellerPayload) => apiRequest<SellerDto>("/sellers", "POST", payload, token),
  update: (token: string, id: string, payload: UpdateSellerPayload) =>
    apiRequest<SellerDto>(`/sellers/${id}`, "PATCH", payload, token),
  deactivate: (token: string, id: string) =>
    apiRequest<DeactivateSellerResponse>(`/sellers/${id}`, "DELETE", undefined, token),
  restore: (token: string, id: string) =>
    apiRequest<{ ok: boolean; seller: SellerDto }>(`/sellers/${id}/restore`, "POST", {}, token),
  assignClient: (token: string, clientId: string, assignedSellerUserId: string | null) =>
    apiRequest<unknown>(`/clients/${clientId}/assignment`, "PATCH", { assignedSellerUserId }, token),
};

/** Mensaje de feedback tras dar de baja a un vendedor. */
export const describeDeactivation = (unassignedLeads: number): string => {
  if (unassignedLeads <= 0) return "Vendedor dado de baja. No tenía leads asignados.";
  if (unassignedLeads === 1) return "Vendedor dado de baja. 1 lead quedó sin asignar.";
  return `Vendedor dado de baja. ${unassignedLeads} leads quedaron sin asignar.`;
};

/** Solo los vendedores activos son asignables. */
export const filterAssignableSellers = (sellers: SellerDto[]): SellerDto[] => sellers.filter((s) => s.active);
