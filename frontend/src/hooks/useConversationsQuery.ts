import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { crmApi } from "@/services/crm";

export const CONVERSATIONS_POLL_MS = 10_000;
export const MESSAGES_POLL_MS = 5_000;

const liveQueryOptions = {
  refetchIntervalInBackground: false,
} as const;

export function useConversationsQuery() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => crmApi.getConversations(token!),
    enabled: Boolean(token),
    refetchInterval: CONVERSATIONS_POLL_MS,
    ...liveQueryOptions,
  });
}

export function useConversationMessagesQuery(conversationId: string | undefined) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => crmApi.getConversationMessages(token!, conversationId!),
    enabled: Boolean(token && conversationId),
    refetchInterval: MESSAGES_POLL_MS,
    ...liveQueryOptions,
  });
}
