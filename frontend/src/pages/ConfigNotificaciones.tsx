import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { Bell, Settings2 } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { accountApi, type NotificationPreferencesDto } from "@/services/account";
import { normalizeApiError } from "@/lib/formErrors";
import { toast } from "sonner";
import {
  checkOsPushPermission,
  ensurePushRegistration,
  openNativeAppSettings,
  unregisterStoredPushDevice,
  type OsPushPermissionStatus,
} from "@/mobile/pushRegistration";
import { cn } from "@/lib/utils";

const DEFAULT_PREFS: NotificationPreferencesDto = {
  pushEnabled: true,
  notifyLeadInterest: true,
  notifyEscalations: true,
  notifyInboundMessages: true,
};

const osPermissionLabel = (status: OsPushPermissionStatus) => {
  if (status === "granted") return "activadas";
  if (status === "denied") return "bloqueadas";
  if (status === "prompt") return "sin confirmar";
  return "solo en la app";
};

export default function ConfigNotificaciones() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const isNative = Capacitor.isNativePlatform();

  const [prefs, setPrefs] = useState<NotificationPreferencesDto>(DEFAULT_PREFS);
  const [osPermission, setOsPermission] = useState<OsPushPermissionStatus>(isNative ? "prompt" : "unsupported");

  const { data, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => accountApi.getNotificationPreferences(token!),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (!data) return;
    setPrefs(data);
  }, [data]);

  const refreshOsPermission = useCallback(async () => {
    const status = await checkOsPushPermission();
    setOsPermission(status);
    return status;
  }, []);

  useEffect(() => {
    void refreshOsPermission();
  }, [refreshOsPermission]);

  const saveMutation = useMutation({
    mutationFn: (patch: Partial<NotificationPreferencesDto>) =>
      accountApi.patchNotificationPreferences(token!, patch),
    onSuccess: async (next, patch) => {
      setPrefs(next);
      await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });

      if (patch.pushEnabled === false && token) {
        await unregisterStoredPushDevice(token);
      }
      if (patch.pushEnabled === true && token) {
        const status = await ensurePushRegistration(token);
        setOsPermission(status);
        if (status === "denied") {
          toast.message("Activa las notificaciones del sistema para recibirlas.");
        }
      }
    },
    onError: (error) => {
      toast.error(normalizeApiError(error, "No se pudieron guardar las preferencias.").formError);
      void queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
  });

  const applyPatch = (patch: Partial<NotificationPreferencesDto>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
    saveMutation.mutate(patch);
  };

  const kindsDisabled = !prefs.pushEnabled;
  const osBlocked = isNative && osPermission === "denied";

  return (
    <>
      <ScreenHeader title="Notificaciones" subtitle="Qué avisos quieres recibir" back />

      <div className="px-4 py-4 space-y-4">
        <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-muted grid place-items-center text-muted-foreground shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-semibold">Notificaciones del sistema</p>
              <p className="text-xs text-muted-foreground">
                {isNative
                  ? `Estado: ${osPermissionLabel(osPermission)}`
                  : "Disponible en la app iOS/Android."}
              </p>
            </div>
          </div>
          {isNative && osBlocked ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                openNativeAppSettings().catch(() => {
                  toast.error("No se pudieron abrir los ajustes.");
                });
              }}
            >
              <Settings2 className="w-4 h-4 mr-2" />
              Abrir ajustes
            </Button>
          ) : null}
          {isNative && !osBlocked ? (
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => void refreshOsPermission()}>
              Actualizar estado
            </Button>
          ) : null}
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Recibir notificaciones push</p>
              <p className="text-xs text-muted-foreground">Master: apaga todos los avisos push de esta cuenta.</p>
            </div>
            <Switch
              checked={prefs.pushEnabled}
              disabled={isLoading || saveMutation.isPending}
              onCheckedChange={(checked) => applyPatch({ pushEnabled: checked })}
            />
          </div>
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-1">
          <div className="flex items-center justify-between gap-2 pb-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Por tipo de evento</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={isLoading || saveMutation.isPending}
              onClick={() =>
                applyPatch({
                  pushEnabled: true,
                  notifyLeadInterest: true,
                  notifyEscalations: true,
                  notifyInboundMessages: false,
                })
              }
            >
              Solo importante
            </Button>
          </div>

          <PreferenceRow
            title="Leads"
            description="Cuando un cliente muestra interés en un vehículo."
            checked={prefs.notifyLeadInterest}
            disabled={kindsDisabled || isLoading || saveMutation.isPending}
            onCheckedChange={(checked) => applyPatch({ notifyLeadInterest: checked })}
          />
          <PreferenceRow
            title="Escalaciones / asesor humano"
            description="Cuando el cliente pide ayuda o dudas de financiamiento."
            checked={prefs.notifyEscalations}
            disabled={kindsDisabled || isLoading || saveMutation.isPending}
            onCheckedChange={(checked) => applyPatch({ notifyEscalations: checked })}
          />
          <PreferenceRow
            title="Mensajes entrantes"
            description="Cuando un cliente envía un mensaje (cuando estén disponibles)."
            checked={prefs.notifyInboundMessages}
            disabled={kindsDisabled || isLoading || saveMutation.isPending}
            onCheckedChange={(checked) => applyPatch({ notifyInboundMessages: checked })}
            last
          />
        </div>

        {osBlocked && prefs.pushEnabled ? (
          <p className="text-xs text-muted-foreground px-1">
            Las preferencias se guardan, pero el sistema bloquea el envío hasta que actives las notificaciones en ajustes.
          </p>
        ) : null}

        <button
          type="button"
          className="text-xs text-primary-dark underline px-1"
          onClick={() => navigate("/perfil")}
        >
          Volver al perfil
        </button>
      </div>
    </>
  );
}

function PreferenceRow({
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
  last = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-3",
        !last && "border-b border-border",
        disabled && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
