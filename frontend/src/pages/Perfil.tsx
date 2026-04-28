import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut,
  Bell,
  HelpCircle,
  Shield,
  ChevronRight,
  Building2,
  Link2,
  KeyRound,
  Settings,
  Clock3,
  Save,
  Plus,
  FlaskConical,
  Car,
  AlertTriangle,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { accountApi, type BusinessProfileDto } from "@/services/account";
import { crmApi } from "@/services/crm";
import { integrationsApi, type IntegrationDto } from "@/services/integrations";
import { authApi } from "@/services/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const emptyBusiness: BusinessProfileDto = {
  tradeName: null,
  legalName: null,
  taxId: null,
  businessPhone: null,
  businessEmail: null,
  website: null,
  addressLine: null,
  city: null,
  state: null,
  country: null,
  description: null,
  logoUrl: null,
};

export default function Perfil() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { logout, user, token, refreshProfile } = useAuth();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["account-profile"],
    queryFn: () => accountApi.getProfile(token!),
    enabled: Boolean(token),
  });

  const { data: kpis } = useQuery({
    queryKey: ["kpis"],
    queryFn: () => crmApi.getKpis(token!),
    enabled: Boolean(token),
  });

  const { data: integrations = [] } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => integrationsApi.list(token!),
    enabled: Boolean(token),
  });

  const { data: serviceTokens = [] } = useQuery({
    queryKey: ["service-tokens"],
    queryFn: () => authApi.listServiceTokens(token!),
    enabled: Boolean(token),
  });

  const [userForm, setUserForm] = useState({ name: "", phone: "", defaultPlatform: "" });
  const [bizForm, setBizForm] = useState<BusinessProfileDto>(emptyBusiness);
  const [credOpenFor, setCredOpenFor] = useState<string | null>(null);
  const [credJson, setCredJson] = useState("{}");
  const [credError, setCredError] = useState("");
  const [wcCredForm, setWcCredForm] = useState({
    deviceId: "",
    webhookSecret: "",
    tenantId: "",
  });
  const [newTokenName, setNewTokenName] = useState("");
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [lastCreatedToken, setLastCreatedToken] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [lastQrByIntegrationId, setLastQrByIntegrationId] = useState<Record<string, { url: string; expiresAt: string }>>({});
  const [lastQrErrorByIntegrationId, setLastQrErrorByIntegrationId] = useState<Record<string, string>>({});
  const [deviceStatusByIntegrationId, setDeviceStatusByIntegrationId] = useState<Record<string, { status: "ONLINE" | "OFFLINE" | "UNKNOWN"; updatedAt: string }>>({});
  const [deviceStatusLoadingIntegrationId, setDeviceStatusLoadingIntegrationId] = useState<string | null>(null);
  const [qrLoadingIntegrationId, setQrLoadingIntegrationId] = useState<string | null>(null);
  const [qrViewerOpen, setQrViewerOpen] = useState(false);
  const [qrViewerIntegrationId, setQrViewerIntegrationId] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      void refreshProfile().catch(() => {});
    }
  }, [token, refreshProfile]);

  useEffect(() => {
    if (!profile) return;
    setUserForm({
      name: profile.user.name || "",
      phone: profile.user.phone || "",
      defaultPlatform: profile.user.defaultPlatform || "",
    });
    setBizForm({ ...emptyBusiness, ...(profile.business || {}) });
  }, [profile]);

  const saveProfileMutation = useMutation({
    mutationFn: () =>
      accountApi.patchProfile(token!, {
        user: {
          name: userForm.name.trim(),
          phone: userForm.phone.trim() || null,
          defaultPlatform: (userForm.defaultPlatform || null) as "whatsapp" | "facebook" | "telegram" | "web" | "api" | null,
        },
        business: {
          ...bizForm,
          tradeName: bizForm.tradeName?.trim() || null,
          legalName: bizForm.legalName?.trim() || null,
          taxId: bizForm.taxId?.trim() || null,
          businessPhone: bizForm.businessPhone?.trim() || null,
          businessEmail: bizForm.businessEmail?.trim() || null,
          website: bizForm.website?.trim() || null,
          addressLine: bizForm.addressLine?.trim() || null,
          city: bizForm.city?.trim() || null,
          state: bizForm.state?.trim() || null,
          country: bizForm.country?.trim() || null,
          description: bizForm.description?.trim() || null,
          logoUrl: bizForm.logoUrl?.trim() || null,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["account-profile"] });
      await refreshProfile();
    },
  });

  const createIntegrationMutation = useMutation({
    mutationFn: (body: Parameters<typeof integrationsApi.create>[1]) => integrationsApi.create(token!, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });

  const saveCredsMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => integrationsApi.postCredentials(token!, id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      setCredOpenFor(null);
      setCredJson("{}");
      setCredError("");
      setWcCredForm({
        deviceId: "",
        webhookSecret: "",
        tenantId: "",
      });
    },
    onError: (error) => {
      const message = error instanceof Error && error.message.trim() ? error.message : "No se pudieron guardar las credenciales.";
      setCredError(message);
    },
  });

  const testIntegrationMutation = useMutation({
    mutationFn: (id: string) => integrationsApi.test(token!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });

  const createTokenMutation = useMutation({
    mutationFn: () => authApi.createServiceToken(token!, newTokenName.trim()),
    onSuccess: (res) => {
      setLastCreatedToken(res.token);
      setNewTokenName("");
      queryClient.invalidateQueries({ queryKey: ["service-tokens"] });
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (id: string) => authApi.revokeServiceToken(token!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["service-tokens"] }),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => accountApi.deleteAccount(token!, { confirmText: deleteConfirmText }),
    onSuccess: async () => {
      await logout();
      navigate("/login", { replace: true });
    },
  });

  const safeKpis: { activeChats: number; newLeads: number; conversions: number } = (kpis as { activeChats: number; newLeads: number; conversions: number } | undefined) || {
    activeChats: 0,
    newLeads: 0,
    conversions: 0,
  };

  const dirty = useMemo(() => {
    if (!profile) return false;
    const u =
      profile.user.name !== userForm.name.trim() ||
      (profile.user.phone || "") !== (userForm.phone.trim() || "") ||
      (profile.user.defaultPlatform || "") !== (userForm.defaultPlatform || "");
    const b = JSON.stringify(profile.business || {}) !== JSON.stringify({ ...emptyBusiness, ...bizForm });
    return u || b;
  }, [profile, userForm, bizForm]);

  const channelLabel = (c: IntegrationDto["channel"]) => {
    const m: Record<string, string> = {
      whatsapp: "WhatsApp",
      facebook: "Facebook",
      telegram: "Telegram",
      web: "Web",
      api: "API",
    };
    return m[c] || c;
  };

  const qrLinkMutation = useMutation({
    mutationFn: (integrationId: string) => integrationsApi.createWhatsAppQrLink(token!, integrationId),
    onMutate: (integrationId) => {
      setQrLoadingIntegrationId(integrationId);
      setLastQrErrorByIntegrationId((prev) => ({ ...prev, [integrationId]: "" }));
    },
    onSuccess: (data, integrationId) => {
      setLastQrByIntegrationId((prev) => ({ ...prev, [integrationId]: data }));
      setLastQrErrorByIntegrationId((prev) => ({ ...prev, [integrationId]: "" }));
      setQrViewerIntegrationId(integrationId);
      setQrViewerOpen(true);
    },
    onError: (error, integrationId) => {
      setLastQrErrorByIntegrationId((prev) => ({ ...prev, [integrationId]: (error as Error).message }));
    },
    onSettled: () => {
      setQrLoadingIntegrationId(null);
    },
  });

  const deviceStatusMutation = useMutation({
    // Lee estado del device para feedback operativo en la tarjeta de integración.
    mutationFn: (integrationId: string) => integrationsApi.getWhatsAppDeviceStatus(token!, integrationId),
    onMutate: (integrationId) => setDeviceStatusLoadingIntegrationId(integrationId),
    onSuccess: (data, integrationId) => {
      setDeviceStatusByIntegrationId((prev) => ({ ...prev, [integrationId]: data }));
    },
    onSettled: () => setDeviceStatusLoadingIntegrationId(null),
  });

  const sendTestMutation = useMutation({
    // Ejecuta envío manual para validar credenciales y canal outbound.
    mutationFn: (params: { integrationId: string; to: string; text: string }) => integrationsApi.sendWhatsAppTest(token!, params),
  });

  const openQrViewer = (integrationId: string) => {
    setQrViewerIntegrationId(integrationId);
    setQrViewerOpen(true);
  };

  const activeQr = qrViewerIntegrationId ? lastQrByIntegrationId[qrViewerIntegrationId] : null;
  const activeQrIsExpired = activeQr ? new Date(activeQr.expiresAt).getTime() <= Date.now() : false;
  const activeCredIntegration = credOpenFor ? integrations.find((it) => it.id === credOpenFor) || null : null;
  const isWhatsAppConnectCredModal = Boolean(
    activeCredIntegration && activeCredIntegration.channel === "whatsapp" && activeCredIntegration.provider === "whatsapp-connect"
  );

  return (
    <>
      <ScreenHeader title="Mi perfil" variant="primary" />

      <div className="px-4 py-5 space-y-5">
        <div className="bg-card rounded-2xl p-5 shadow-card border border-border flex flex-col items-center text-center">
          <Avatar name={user?.name || "Usuario"} color="hsl(162 75% 30%)" size="lg" />
          <h2 className="font-bold text-lg mt-3">{user?.name || "Usuario"}</h2>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
          {bizForm.tradeName ? (
            <p className="text-xs font-semibold text-primary-dark mt-1">{bizForm.tradeName}</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">Completa los datos de tu negocio abajo</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button type="button" onClick={() => navigate("/chats")} className="bg-card rounded-2xl p-3 text-center shadow-card border border-border hover:bg-muted/40">
            <p className="text-xl font-extrabold text-primary-dark">{safeKpis.activeChats}</p>
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">Chats</p>
          </button>
          <button type="button" onClick={() => navigate("/clientes")} className="bg-card rounded-2xl p-3 text-center shadow-card border border-border hover:bg-muted/40">
            <p className="text-xl font-extrabold text-primary-dark">{safeKpis.newLeads}</p>
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">Leads</p>
          </button>
          <div className="bg-card rounded-2xl p-3 text-center shadow-card border border-border">
            <p className="text-xl font-extrabold text-primary-dark">{safeKpis.conversions}</p>
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">Ventas</p>
          </div>
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <p className="font-semibold text-sm">Tu cuenta</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Nombre</Label>
            <Input value={userForm.name} onChange={(e) => setUserForm((s) => ({ ...s, name: e.target.value }))} />
            <Label className="text-xs">Teléfono</Label>
            <Input value={userForm.phone} onChange={(e) => setUserForm((s) => ({ ...s, phone: e.target.value }))} placeholder="+57..." />
            <Label className="text-xs">Canal por defecto</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={userForm.defaultPlatform}
              onChange={(e) => setUserForm((s) => ({ ...s, defaultPlatform: e.target.value }))}
            >
              <option value="">(sin definir)</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="facebook">Facebook</option>
              <option value="telegram">Telegram</option>
              <option value="web">Web</option>
              <option value="api">API</option>
            </select>
          </div>
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-success" />
            <p className="font-semibold text-sm">Datos del negocio</p>
          </div>
          <div className="grid gap-2">
            <Input placeholder="Nombre comercial" value={bizForm.tradeName || ""} onChange={(e) => setBizForm((s) => ({ ...s, tradeName: e.target.value }))} />
            <Input placeholder="Razón social" value={bizForm.legalName || ""} onChange={(e) => setBizForm((s) => ({ ...s, legalName: e.target.value }))} />
            <Input placeholder="NIT / ID fiscal" value={bizForm.taxId || ""} onChange={(e) => setBizForm((s) => ({ ...s, taxId: e.target.value }))} />
            <Input placeholder="Teléfono del negocio" value={bizForm.businessPhone || ""} onChange={(e) => setBizForm((s) => ({ ...s, businessPhone: e.target.value }))} />
            <Input placeholder="Email del negocio" value={bizForm.businessEmail || ""} onChange={(e) => setBizForm((s) => ({ ...s, businessEmail: e.target.value }))} />
            <Input placeholder="Sitio web" value={bizForm.website || ""} onChange={(e) => setBizForm((s) => ({ ...s, website: e.target.value }))} />
            <Input placeholder="Dirección" value={bizForm.addressLine || ""} onChange={(e) => setBizForm((s) => ({ ...s, addressLine: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Ciudad" value={bizForm.city || ""} onChange={(e) => setBizForm((s) => ({ ...s, city: e.target.value }))} />
              <Input placeholder="Estado / Depto" value={bizForm.state || ""} onChange={(e) => setBizForm((s) => ({ ...s, state: e.target.value }))} />
            </div>
            <Input placeholder="País" value={bizForm.country || ""} onChange={(e) => setBizForm((s) => ({ ...s, country: e.target.value }))} />
            <Textarea placeholder="Descripción corta del negocio" value={bizForm.description || ""} onChange={(e) => setBizForm((s) => ({ ...s, description: e.target.value }))} rows={3} />
            <Input placeholder="URL del logo" value={bizForm.logoUrl || ""} onChange={(e) => setBizForm((s) => ({ ...s, logoUrl: e.target.value }))} />
          </div>
          <Button className="w-full" disabled={!token || profileLoading || !dirty || saveProfileMutation.isPending} onClick={() => saveProfileMutation.mutate()}>
            <Save className="w-4 h-4 mr-2" />
            {saveProfileMutation.isPending ? "Guardando..." : "Guardar perfil"}
          </Button>
          {saveProfileMutation.isError ? (
            <p className="text-xs text-destructive">{(saveProfileMutation.error as Error).message}</p>
          ) : null}
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-info" />
              <p className="font-semibold text-sm">Integraciones</p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Canal
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Nueva integración</DialogTitle>
                  <DialogDescription>Define el canal y el proveedor (por defecto Meta).</DialogDescription>
                </DialogHeader>
                <NewIntegrationForm
                  disabled={createIntegrationMutation.isPending}
                  onSubmit={(body) => createIntegrationMutation.mutate(body)}
                />
              </DialogContent>
            </Dialog>
          </div>
          <p className="text-xs text-muted-foreground">
            Para WhatsApp/Facebook/Telegram: si creas una integración aquí, el bot solo responderá automáticamente cuando esté <strong>activa</strong> y tenga credenciales guardadas.
          </p>
          <ul className="space-y-2">
            {integrations.map((it) => (
              <li key={it.id} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{channelLabel(it.channel)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {it.provider} · {it.status}
                      {it.hasActiveCredential ? " · credenciales OK" : " · sin credenciales"}
                    </p>
                    {it.lastError ? <p className="text-[11px] text-destructive mt-1">{it.lastError}</p> : null}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="sm" variant="secondary" className="h-8" onClick={() => testIntegrationMutation.mutate(it.id)} disabled={testIntegrationMutation.isPending}>
                      <FlaskConical className="w-3.5 h-3.5 mr-1" /> Probar
                    </Button>
                    {it.channel === "whatsapp" && it.provider === "whatsapp-connect" ? (
                      <Button size="sm" variant="outline" className="h-8" onClick={() => qrLinkMutation.mutate(it.id)} disabled={qrLoadingIntegrationId === it.id}>
                        {qrLoadingIntegrationId === it.id ? "Generando QR..." : "Generar QR"}
                      </Button>
                    ) : null}
                    {it.channel === "whatsapp" && it.provider === "whatsapp-connect" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => deviceStatusMutation.mutate(it.id)}
                        disabled={deviceStatusLoadingIntegrationId === it.id}
                      >
                        {deviceStatusLoadingIntegrationId === it.id ? "Consultando..." : "Estado device"}
                      </Button>
                    ) : null}
                    {it.channel === "whatsapp" && it.provider === "whatsapp-connect" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={sendTestMutation.isPending}
                        onClick={() => {
                          // Flujo simple de prueba sin crear formulario adicional.
                          const to = window.prompt("Número destino (con código de país):", "");
                          if (!to) return;
                          const text = window.prompt("Mensaje de prueba:", "Hola desde Car Advisor Bot");
                          if (!text) return;
                          sendTestMutation.mutate({ integrationId: it.id, to, text });
                        }}
                      >
                        Probar envío
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => {
                        setCredOpenFor(it.id);
                        setCredError("");
                        setCredJson("{}");
                        setWcCredForm({
                          deviceId: "",
                          webhookSecret: "",
                          tenantId: "",
                        });
                      }}
                    >
                      Credenciales
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={it.status === "active" ? "default" : "outline"}
                    className="h-8"
                    onClick={() => integrationsApi.patch(token!, it.id, { status: "active" }).then(() => queryClient.invalidateQueries({ queryKey: ["integrations"] }))}
                  >
                    Activar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => integrationsApi.patch(token!, it.id, { status: "disabled" }).then(() => queryClient.invalidateQueries({ queryKey: ["integrations"] }))}
                  >
                    Desactivar
                  </Button>
                </div>
                {it.channel === "whatsapp" && it.provider === "whatsapp-connect" ? (
                  <div className="space-y-1">
                    {lastQrErrorByIntegrationId[it.id] ? <p className="text-[11px] text-destructive">{lastQrErrorByIntegrationId[it.id]}</p> : null}
                    {lastQrByIntegrationId[it.id]?.expiresAt ? (
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(lastQrByIntegrationId[it.id].expiresAt).getTime() <= Date.now()
                          ? "QR expirado. Genera uno nuevo."
                          : `QR vigente hasta ${new Date(lastQrByIntegrationId[it.id].expiresAt).toLocaleString()}`}
                      </p>
                    ) : null}
                    {lastQrByIntegrationId[it.id]?.url ? (
                      <Button size="sm" variant="ghost" className="h-7 px-1 text-[11px]" onClick={() => openQrViewer(it.id)}>
                        Ver QR en modal
                      </Button>
                    ) : null}
                    {deviceStatusByIntegrationId[it.id] ? (
                      <p className="text-[11px] text-muted-foreground">
                        Device {deviceStatusByIntegrationId[it.id].status} · actualizado {new Date(deviceStatusByIntegrationId[it.id].updatedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
            {integrations.length === 0 ? <p className="text-xs text-muted-foreground">No hay integraciones. Añade al menos una si quieres exigir credenciales por canal.</p> : null}
          </ul>
        </div>

        <Dialog
          open={Boolean(credOpenFor)}
          onOpenChange={(o) => {
            if (o) return;
            setCredOpenFor(null);
            setCredError("");
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{isWhatsAppConnectCredModal ? "Credenciales WhatsApp Connect" : "Credenciales (JSON)"}</DialogTitle>
              <DialogDescription>Se guardan cifradas en el servidor. No se vuelven a mostrar.</DialogDescription>
            </DialogHeader>
            {isWhatsAppConnectCredModal ? (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Device ID *</Label>
                  <Input
                    className="mt-1"
                    value={wcCredForm.deviceId}
                    onChange={(e) => setWcCredForm((s) => ({ ...s, deviceId: e.target.value }))}
                    placeholder="device_xxx"
                  />
                </div>
                <div>
                  <Label className="text-xs">Webhook secret *</Label>
                  <Input
                    className="mt-1"
                    value={wcCredForm.webhookSecret}
                    onChange={(e) => setWcCredForm((s) => ({ ...s, webhookSecret: e.target.value }))}
                    placeholder="secreto para validar firma webhook"
                  />
                </div>
                <div>
                  <Label className="text-xs">Tenant ID (opcional)</Label>
                  <Input
                    className="mt-1"
                    value={wcCredForm.tenantId}
                    onChange={(e) => setWcCredForm((s) => ({ ...s, tenantId: e.target.value }))}
                    placeholder="tenant_123"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">El Service JWT se configura en backend (`WC_SERVICE_JWT`), no en este formulario.</p>
              </div>
            ) : (
              <Textarea rows={10} className="font-mono text-xs" value={credJson} onChange={(e) => setCredJson(e.target.value)} />
            )}
            <Button
              className="w-full"
              disabled={!credOpenFor || saveCredsMutation.isPending}
              onClick={() => {
                if (!credOpenFor) return;
                if (isWhatsAppConnectCredModal) {
                  const deviceId = wcCredForm.deviceId.trim();
                  const webhookSecret = wcCredForm.webhookSecret.trim();
                  const tenantId = wcCredForm.tenantId.trim();
                  if (!deviceId || !webhookSecret) {
                    setCredError("Device ID y Webhook secret son obligatorios.");
                    return;
                  }
                  setCredError("");
                  const payload: Record<string, unknown> = {
                    deviceId,
                    webhookSecret,
                    ...(tenantId ? { tenantId } : {}),
                  };
                  saveCredsMutation.mutate({ id: credOpenFor, payload });
                  return;
                }
                try {
                  setCredError("");
                  const payload = JSON.parse(credJson || "{}") as Record<string, unknown>;
                  saveCredsMutation.mutate({ id: credOpenFor, payload });
                } catch {
                  setCredError("JSON inválido");
                }
              }}
            >
              {saveCredsMutation.isPending ? "Guardando..." : "Guardar credenciales"}
            </Button>
            {credError ? <p className="text-xs text-destructive">{credError}</p> : null}
          </DialogContent>
        </Dialog>

        <Dialog open={qrViewerOpen} onOpenChange={setQrViewerOpen}>
          <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Escanea tu QR de WhatsApp</DialogTitle>
              <DialogDescription>
                {activeQrIsExpired
                  ? "Este QR ya expiró. Puedes regenerarlo desde la tarjeta de integración."
                  : "Si no se visualiza por políticas del proveedor, usa el botón de abrir en pestaña nueva."}
              </DialogDescription>
            </DialogHeader>
            {activeQr?.url ? (
              <div className="space-y-3">
                <div className="w-full flex justify-center">
                  <iframe
                    src={activeQr.url}
                    title="QR WhatsApp Connect"
                    loading="lazy"
                    className="w-full max-w-[375px] rounded-md border border-border bg-background"
                    style={{ height: "min(667px, 55vh)" }}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="w-full" onClick={() => window.open(activeQr.url, "_blank", "noopener,noreferrer")}>
                    Abrir en pestaña nueva
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Primero genera un QR desde la integración.</p>
            )}
          </DialogContent>
        </Dialog>

        <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-warning" />
              <p className="font-semibold text-sm">Tokens API (bot)</p>
            </div>
            <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8" onClick={() => setLastCreatedToken(null)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear token de servicio</DialogTitle>
                  <DialogDescription>El valor completo solo se muestra una vez.</DialogDescription>
                </DialogHeader>
                <Input placeholder="Nombre (ej. n8n producción)" value={newTokenName} onChange={(e) => setNewTokenName(e.target.value)} />
                <Button className="w-full" disabled={!newTokenName.trim() || createTokenMutation.isPending} onClick={() => createTokenMutation.mutate()}>
                  {createTokenMutation.isPending ? "Creando..." : "Crear"}
                </Button>
                {lastCreatedToken ? (
                  <div className="rounded-lg border border-border p-2 text-xs break-all">
                    <p className="font-semibold mb-1">Copia y guarda ahora:</p>
                    <code>{lastCreatedToken}</code>
                  </div>
                ) : null}
              </DialogContent>
            </Dialog>
          </div>
          <ul className="space-y-2">
            {serviceTokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-xs border border-border rounded-lg px-3 py-2">
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-muted-foreground">{t.revokedAt ? "Revocado" : "Activo"}</p>
                </div>
                {!t.revokedAt ? (
                  <Button size="sm" variant="destructive" className="h-8" onClick={() => revokeTokenMutation.mutate(t.id)} disabled={revokeTokenMutation.isPending}>
                    Revocar
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <ul className="bg-card rounded-2xl shadow-card border border-border overflow-hidden">
          <li>
            <button type="button" onClick={() => navigate("/config")} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40">
              <div className="w-9 h-9 rounded-xl bg-primary/10 grid place-items-center text-primary">
                <Settings className="w-4 h-4" />
              </div>
              <span className="flex-1 text-sm font-medium">Configuración del bot</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </li>
          <li className="border-t border-border">
            <button type="button" onClick={() => navigate("/config/bot")} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40">
              <div className="w-9 h-9 rounded-xl bg-accent grid place-items-center text-accent-foreground">
                <Clock3 className="w-4 h-4" />
              </div>
              <span className="flex-1 text-sm font-medium">Horario del bot</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </li>
          <li className="border-t border-border">
            <button type="button" onClick={() => navigate("/vehiculos")} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40">
              <div className="w-9 h-9 rounded-xl bg-primary/10 grid place-items-center text-primary-dark">
                <Car className="w-4 h-4" />
              </div>
              <span className="flex-1 text-sm font-medium">Vehículos y ventas</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </li>
          <li className="border-t border-border">
            <button type="button" className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40 opacity-70" disabled>
              <div className="w-9 h-9 rounded-xl bg-muted grid place-items-center text-muted-foreground">
                <Bell className="w-4 h-4" />
              </div>
              <span className="flex-1 text-sm font-medium">Notificaciones</span>
              <span className="text-xs text-muted-foreground">Pronto</span>
            </button>
          </li>
          <li className="border-t border-border">
            <button type="button" onClick={() => navigate("/config")} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40">
              <div className="w-9 h-9 rounded-xl bg-info/10 grid place-items-center text-info">
                <HelpCircle className="w-4 h-4" />
              </div>
              <span className="flex-1 text-sm font-medium">Ayuda y soporte</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </li>
          <li className="border-t border-border">
            <button type="button" className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40" onClick={() => navigate("/perfil")}>
              <div className="w-9 h-9 rounded-xl bg-success/10 grid place-items-center text-success">
                <Shield className="w-4 h-4" />
              </div>
              <span className="flex-1 text-sm font-medium">Privacidad</span>
              <span className="text-xs text-muted-foreground">Cuenta</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </li>
        </ul>

        <div className="bg-card rounded-2xl p-4 shadow-card border border-destructive/30 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-destructive">Eliminar cuenta</p>
              <p className="text-xs text-muted-foreground mt-1">
                Eliminará de forma permanente tu usuario y los datos asociados.
              </p>
            </div>
          </div>
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="w-full">Iniciar eliminación de cuenta</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Confirmar eliminación de cuenta</DialogTitle>
                <DialogDescription>
                  Esta acción es permanente. Para continuar, escribe <strong>ELIMINAR</strong>.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label className="text-xs">Confirmación</Label>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="ELIMINAR"
                />
              </div>
              <Button
                variant="destructive"
                className="w-full"
                disabled={deleteAccountMutation.isPending || deleteConfirmText.trim().toUpperCase() !== "ELIMINAR"}
                onClick={() => deleteAccountMutation.mutate()}
              >
                {deleteAccountMutation.isPending ? "Eliminando..." : "Eliminar cuenta definitivamente"}
              </Button>
              {deleteAccountMutation.isError ? (
                <p className="text-xs text-destructive">{(deleteAccountMutation.error as Error).message}</p>
              ) : null}
            </DialogContent>
          </Dialog>
        </div>

        <button
          type="button"
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="w-full h-12 rounded-2xl border border-destructive/30 text-destructive font-semibold flex items-center justify-center gap-2 hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Cerrar sesión
        </button>

        <p className="text-center text-[10px] text-muted-foreground">AutoBot · Perfil y cuenta</p>
      </div>
    </>
  );
}

function NewIntegrationForm({
  onSubmit,
  disabled,
}: {
  disabled: boolean;
  onSubmit: (body: { channel: IntegrationDto["channel"]; provider?: string; displayName?: string }) => void;
}) {
  const [channel, setChannel] = useState<IntegrationDto["channel"]>("whatsapp");
  const [provider, setProvider] = useState("meta");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (channel === "whatsapp") {
      setProvider((prev) => (prev === "meta" || prev === "whatsapp-connect" ? prev : "meta"));
      return;
    }
    if (!provider.trim()) setProvider("meta");
  }, [channel, provider]);

  const isWhatsApp = channel === "whatsapp";

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Canal</Label>
        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm mt-1" value={channel} onChange={(e) => setChannel(e.target.value as IntegrationDto["channel"])}>
          <option value="whatsapp">WhatsApp</option>
          <option value="facebook">Facebook</option>
          <option value="telegram">Telegram</option>
          <option value="web">Web</option>
          <option value="api">API</option>
        </select>
      </div>
      <div>
        <Label className="text-xs">Proveedor</Label>
        {isWhatsApp ? (
          <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm mt-1" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="meta">meta</option>
            <option value="whatsapp-connect">whatsapp-connect</option>
          </select>
        ) : (
          <Input className="mt-1" value={provider} onChange={(e) => setProvider(e.target.value)} />
        )}
      </div>
      <div>
        <Label className="text-xs">Nombre visible</Label>
        <Input className="mt-1" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ej. WhatsApp principal" />
      </div>
      <Button className="w-full" disabled={disabled} onClick={() => onSubmit({ channel, provider, displayName: displayName.trim() || undefined })}>
        Crear
      </Button>
    </div>
  );
}
