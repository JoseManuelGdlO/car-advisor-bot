import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, MessageCircle, Unplug } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/context/AuthContext";
import { integrationsApi } from "@/services/integrations";
import { launchEmbeddedSignup, loadFacebookSdk } from "@/lib/meta-embedded-signup";
import {
  isWhatsAppMetaConnected,
  metaSignupHint,
  selectWhatsAppMetaIntegration,
  whatsAppMetaDisplayPhone,
} from "@/lib/whatsappMeta";
import { normalizeApiError } from "@/lib/formErrors";
import { toast } from "sonner";

export default function Integraciones() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testText, setTestText] = useState("Hola desde Car Advisor Bot");

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => integrationsApi.list(token!),
    enabled: Boolean(token),
  });

  const { data: metaStatus } = useQuery({
    queryKey: ["whatsapp-meta-status"],
    queryFn: () => integrationsApi.getWhatsAppMetaStatus(token!),
    enabled: Boolean(token),
  });

  const { data: metaConfig } = useQuery({
    queryKey: ["whatsapp-meta-signup-config"],
    queryFn: () => integrationsApi.getMetaSignupConfig(token!),
    enabled: Boolean(token),
  });
  const signupHint = metaSignupHint(metaConfig?.configured);

  const integration = selectWhatsAppMetaIntegration(integrations);
  const connected = isWhatsAppMetaConnected(integration);
  const displayPhone =
    metaStatus?.displayPhoneNumber?.trim() || whatsAppMetaDisplayPhone(integration);

  const refreshWhatsApp = async () => {
    await queryClient.invalidateQueries({ queryKey: ["integrations"] });
    await queryClient.invalidateQueries({ queryKey: ["whatsapp-meta-status"] });
  };

  const disconnectMutation = useMutation({
    mutationFn: () => integrationsApi.disconnectMetaWhatsapp(token!),
    onSuccess: async () => {
      setDisconnectOpen(false);
      await refreshWhatsApp();
      toast.success("WhatsApp desconectado.");
    },
    onError: (error) => {
      toast.error(normalizeApiError(error, "No se pudo desconectar WhatsApp.").formError);
    },
  });

  const sendTestMutation = useMutation({
    mutationFn: (body: { to: string; text: string }) => integrationsApi.sendWhatsAppCloudTest(token!, body),
    onSuccess: () => toast.success("Mensaje de prueba enviado."),
    onError: (error) => toast.error(normalizeApiError(error, "No se pudo enviar la prueba.").formError),
  });

  const connectMeta = async () => {
    if (!token) return;
    setConnecting(true);
    try {
      const config = await integrationsApi.getMetaSignupConfig(token);
      if (!config.configured) {
        toast.error("Embedded Signup no está configurado en el servidor.");
        return;
      }
      await loadFacebookSdk(config.appId, config.graphVersion);
      const { code, session } = await launchEmbeddedSignup({
        configId: config.configId,
        featureType: config.featureType,
        sessionInfoVersion: config.sessionInfoVersion,
      });
      await integrationsApi.completeMetaSignup(token, {
        code,
        wabaId: session?.wabaId ?? null,
        phoneNumberId: session?.phoneNumberId ?? null,
        businessId: session?.businessId ?? null,
        event: session?.event ?? null,
      });
      await refreshWhatsApp();
      toast.success("WhatsApp conectado.");
    } catch (error) {
      toast.error(normalizeApiError(error, "No se pudo conectar WhatsApp.").formError);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <>
      <ScreenHeader title="Integraciones" subtitle="WhatsApp Business" back />

      <div className="px-4 py-5 space-y-4">
        <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-primary grid place-items-center text-primary-foreground shadow-green shrink-0">
              <MessageCircle className="w-6 h-6" strokeWidth={2.4} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-sm">WhatsApp</p>
                {isLoading ? null : connected ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full text-success bg-success/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    Conectado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full text-muted-foreground bg-muted">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                    No conectado
                  </span>
                )}
              </div>
              {isLoading ? (
                <p className="text-xs text-muted-foreground mt-1">Cargando estado...</p>
              ) : connected ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Número: <span className="font-medium text-foreground">{displayPhone || "conectado"}</span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  Conecta tu número de WhatsApp Business para que el bot responda a tus clientes.
                </p>
              )}
            </div>
          </div>

          {integration?.lastError ? (
            <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{integration.lastError}</p>
          ) : null}

          {isLoading ? null : connected ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={disconnectMutation.isPending || connecting}
              onClick={() => setDisconnectOpen(true)}
            >
              <Unplug className="w-4 h-4 mr-2" />
              Desconectar
            </Button>
          ) : (
            <Button
              type="button"
              className="w-full"
              disabled={connecting || !token || metaConfig?.configured === false}
              onClick={() => void connectMeta()}
            >
              {connecting ? "Conectando..." : "Conectar con Facebook"}
            </Button>
          )}
          {signupHint ? (
            <p className="text-xs text-muted-foreground">{signupHint}</p>
          ) : null}
        </div>

        {connected ? (
          <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-3">
            <div>
              <p className="font-semibold text-sm">Probar envío</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Envía un mensaje para confirmar que el número responde.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Teléfono de prueba</Label>
              <Input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="+52..."
                inputMode="tel"
              />
              <Label className="text-xs">Mensaje</Label>
              <Input value={testText} onChange={(e) => setTestText(e.target.value)} />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={sendTestMutation.isPending}
              onClick={() => {
                const to = testTo.trim();
                const text = testText.trim();
                if (!to || !text) {
                  toast.error("Indica un teléfono y un texto para la prueba.");
                  return;
                }
                sendTestMutation.mutate({ to, text });
              }}
            >
              <FlaskConical className="w-4 h-4 mr-2" />
              {sendTestMutation.isPending ? "Enviando..." : "Probar envío"}
            </Button>
          </div>
        ) : null}
      </div>

      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desconectar WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              El bot dejará de responder en este número. Podrás volver a conectar el mismo u otro número después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={disconnectMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                disconnectMutation.mutate();
              }}
            >
              {disconnectMutation.isPending ? "Desconectando..." : "Desconectar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
