import { apiRequest } from "@/lib/api";

export type NotificationKindFilter =
  | ""
  | "lead"
  | "advisor"
  | "escalation"
  | "inbound"
  | "lead_interest"
  | "human_advisor"
  | "financing_detail_help"
  | "new_inbound_message";

export type OwnerNotificationDto = {
  id: string;
  title: string;
  body: string;
  kind: string | null;
  conversationId: string | null;
  createdAt: string | null;
  readAt: string | null;
};

export type NotificationsListResponse = {
  items: OwnerNotificationDto[];
  unreadCount: number;
};

export type ListNotificationsParams = {
  kind?: NotificationKindFilter;
  unreadOnly?: boolean;
  limit?: number;
};

const buildQuery = (params?: ListNotificationsParams) => {
  const search = new URLSearchParams();
  if (params?.kind) search.set("kind", params.kind);
  if (params?.unreadOnly) search.set("unreadOnly", "true");
  if (params?.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return qs ? `?${qs}` : "";
};

export const notificationsApi = {
  list: (token: string, params?: ListNotificationsParams) =>
    apiRequest<NotificationsListResponse>(`/notifications${buildQuery(params)}`, "GET", undefined, token),
  markRead: (token: string, id: string) =>
    apiRequest<OwnerNotificationDto>(`/notifications/${id}/read`, "PATCH", undefined, token),
  markAllRead: (token: string, body?: { kind?: NotificationKindFilter }) =>
    apiRequest<{ ok: true; updatedCount: number; unreadCount: number }>(
      "/notifications/mark-all-read",
      "POST",
      body || {},
      token,
    ),
  delete: (token: string, id: string) =>
    apiRequest<void>(`/notifications/${id}`, "DELETE", undefined, token),
};
