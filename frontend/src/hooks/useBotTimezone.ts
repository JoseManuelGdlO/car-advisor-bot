import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { normalizeTimezoneValue } from "@/lib/timezones";
import { crmApi } from "@/services/crm";

export function useBotTimezone() {
  const { token, user, isSeller } = useAuth();
  const { data } = useQuery({
    queryKey: ["bot-settings"],
    queryFn: () => crmApi.getBotSettings(token!),
    // Los vendedores no pueden leer bot settings: usan la zona horaria del tenant del perfil.
    enabled: Boolean(token) && !isSeller,
  });

  return normalizeTimezoneValue(isSeller ? user?.tenantTimezone : data?.timezone);
}
