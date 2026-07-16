import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { normalizeTimezoneValue } from "@/lib/timezones";
import { crmApi } from "@/services/crm";

export function useBotTimezone() {
  const { token } = useAuth();
  const { data } = useQuery({
    queryKey: ["bot-settings"],
    queryFn: () => crmApi.getBotSettings(token!),
    enabled: Boolean(token),
  });

  return normalizeTimezoneValue(data?.timezone);
}
