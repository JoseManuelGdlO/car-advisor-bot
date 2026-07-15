import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut,
  Bell,
  HelpCircle,
  Shield,
  ChevronRight,
  Building2,
  Link2,
  Settings,
  Clock3,
  Save,
  Plus,
  FlaskConical,
  Car,
  AlertTriangle,
  MoreVertical,
  Trash2,
  KeyRound,
  QrCode,
  Power,
  PowerOff,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { accountApi, type BusinessProfileDto } from "@/services/account";
import { crmApi } from "@/services/crm";
import { integrationsApi, type IntegrationDto } from "@/services/integrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { GoogleCalendarLinkHelpDialog } from "@/components/GoogleCalendarLinkHelpDialog";
import { FieldErrorText, FormErrorAlert } from "@/components/FormErrorAlert";
import { GOOGLE_CALENDAR_URL_ERROR, isGoogleCalendarSchedulingUrl } from "@/lib/calendarUrl";
import { normalizeApiError } from "@/lib/formErrors";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

const PROFILE_KNOWN_FIELDS = [
  "name",
  "phone",
  "defaultPlatform",
  "calendarSchedulingUrl",
  "tradeName",
  "legalName",
  "taxId",
  "businessPhone",
  "businessEmail",
  "website",
  "addressLine",
  "city",
  "state",
  "country",
  "description",
  "logoUrl",
] as const;

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

  const [userForm, setUserForm] = useState({ name: "", phone: "", defaultPlatform: "", calendarSchedulingUrl: "" });
  const [profileFormError, setProfileFormError] = useState("");
  const [profileFieldErrors, setProfileFieldErrors] = useState<Record<string, string>>({});
  const [deleteFormError, setDeleteFormError] = useState("");
  const [bizForm, setBizForm] = useState<BusinessProfileDto>(emptyBusiness);
  const [credOpenFor, setCredOpenFor] = useState<string | null>(null);
  const [credJson, setCredJson] = useState("{}");
  const [credError, setCredError] = useState("");
  const [wcCredForm, setWcCredForm] = useState({
    deviceId: "",
    webhookSecret: "",
    tenantId: "",
  });
  const [igCredForm, setIgCredForm] = useState({
    instagramBusinessAccountId: "",
    pageId: "",
    pageAccessToken: "",
  });
  const [integrationDialogOpen, setIntegrationDialogOpen] = useState(false);
  const [integrationFormKey, setIntegrationFormKey] = useState(0);
  const [deleteIntegrationId, setDeleteIntegrationId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [lastQrByIntegrationId, setLastQrByIntegrationId] = useState<Record<string, { url: string; expiresAt: string }>>({});
  const [lastQrErrorByIntegrationId, setLastQrErrorByIntegrationId] = useState<Record<string, string>>({});
  const [deviceStatusByIntegrationId, setDeviceStatusByIntegrationId] = useState<Record<string, { status: "ONLINE" | "OFFLINE" | "UNKNOWN"; updatedAt: string }>>({});
  const [deviceStatusLoadingIntegrationId, setDeviceStatusLoadingIntegrationId] = useState<string | null>(null);
  const [qrLoadingIntegrationId, setQrLoadingIntegrationId] = useState<string | null>(null);
  const [qrViewerOpen, setQrViewerOpen] = useState(false);
  const [qrViewerIntegrationId, setQrViewerIntegrationId] = useState<string | null>(null);
  const [calendarUrlEditing, setCalendarUrlEditing] = useState(false);

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
      calendarSchedulingUrl: profile.user.calendarSchedulingUrl || "",
    });
    setCalendarUrlEditing(false);
    setBizForm({ ...emptyBusiness, ...(profile.business || {}) });
  }, [profile]);

  const savedCalendarUrl = profile?.user.calendarSchedulingUrl?.trim() || "";

  const saveProfileMutation = useMutation({
    mutationFn: () => {
      const calendarSchedulingUrl = (userForm.calendarSchedulingUrl || savedCalendarUrl).trim();
      if (!isGoogleCalendarSchedulingUrl(calendarSchedulingUrl)) {
        throw new Error(GOOGLE_CALENDAR_URL_ERROR);
      }
      return accountApi.patchProfile(token!, {
        user: {
          name: userForm.name.trim(),
          phone: userForm.phone.trim() || null,
          defaultPlatform: (userForm.defaultPlatform || null) as "whatsapp" | "facebook" | "telegram" | "web" | "api" | "instagram" | null,
          calendarSchedulingUrl,
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
      });
    },
    onSuccess: async () => {
      setProfileFormError("");
      setProfileFieldErrors({});
      setCalendarUrlEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["account-profile"] });
      await refreshProfile();
    },
    onError: (error) => {
      if (error instanceof Error && error.message === GOOGLE_CALENDAR_URL_ERROR) {
        setProfileFormError("");
        setProfileFieldErrors({ calendarSchedulingUrl: error.message });
        return;
      }
      const { formError, fieldErrors } = normalizeApiError(error, "No se pudo guardar el perfil.", {
        knownFields: PROFILE_KNOWN_FIELDS,
      });
      setProfileFormError(formError);
      setProfileFieldErrors(fieldErrors);
    },
  });

  const createIntegrationMutation = useMutation({
    mutationFn: (body: Parameters<typeof integrationsApi.create>[1]) => integrationsApi.create(token!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Integración creada correctamente.");
      setIntegrationFormKey((key) => key + 1);
      setIntegrationDialogOpen(false);
    },
    onError: (error) => {
      toast.error(normalizeApiError(error, "No se pudo crear la integración.").formError);
    },
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
      setIgCredForm({
        instagramBusinessAccountId: "",
        pageId: "",
        pageAccessToken: "",
      });
    },
    onError: (error) => {
      const { formError } = normalizeApiError(error, "No se pudieron guardar las credenciales.");
      setCredError(formError);
    },
  });

  const patchIntegrationMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: IntegrationDto["status"] }) => integrationsApi.patch(token!, id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Integración actualizada.");
    },
    onError: (error) => toast.error(normalizeApiError(error, "No se pudo actualizar la integración.").formError),
  });

  const deleteIntegrationMutation = useMutation({
    mutationFn: (id: string) => integrationsApi.remove(token!, id),
    onSuccess: (_data, id) => {
      setDeleteIntegrationId(null);
      setLastQrByIntegrationId((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setLastQrErrorByIntegrationId((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDeviceStatusByIntegrationId((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (credOpenFor === id) setCredOpenFor(null);
      if (qrViewerIntegrationId === id) {
        setQrViewerOpen(false);
        setQrViewerIntegrationId(null);
      }
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Integración eliminada.");
    },
    onError: (error) => toast.error(normalizeApiError(error, "No se pudo eliminar la integración.").formError),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => accountApi.deleteAccount(token!, { confirmText: deleteConfirmText }),
    onSuccess: async () => {
      setDeleteFormError("");
      await logout();
      navigate("/login", { replace: true });
    },
    onError: (error) => {
      const { formError } = normalizeApiError(error, "No se pudo eliminar la cuenta.");
      setDeleteFormError(formError);
    },
  });

  const safeKpis = {
    activeChats: Number(kpis?.activeChats) || 0,
    newLeads: Number(kpis?.newLeads) || 0,
    escalations: Number(kpis?.escalations) || 0,
  };

  const dirty = useMemo(() => {
    if (!profile) return false;
    const calendarValue = (userForm.calendarSchedulingUrl || savedCalendarUrl).trim();
    const u =
      profile.user.name !== userForm.name.trim() ||
      (profile.user.phone || "") !== (userForm.phone.trim() || "") ||
      (profile.user.defaultPlatform || "") !== (userForm.defaultPlatform || "") ||
      savedCalendarUrl !== calendarValue;
    const b = JSON.stringify(profile.business || {}) !== JSON.stringify({ ...emptyBusiness, ...bizForm });
    return u || b;
  }, [profile, userForm, bizForm, savedCalendarUrl]);

  const channelLabel = (c: IntegrationDto["channel"]) => {
    const m: Record<string, string> = {
      whatsapp: "WhatsApp",
      facebook: "Facebook",
      telegram: "Telegram",
      web: "Web",
      api: "API",
      instagram: "Instagram",
    };
    return m[c] || c;
  };

  const metaInstagramWebhookUrl = useMemo(() => {
    const raw = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api").trim().replace(/\/$/, "");
    return `${raw}/webhooks/meta/instagram`;
  }, []);

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
      const { formError } = normalizeApiError(error, "No se pudo generar el QR.");
      setLastQrErrorByIntegrationId((prev) => ({ ...prev, [integrationId]: formError }));
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

  const fetchedDeviceStatusRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token) return;
    integrations
      .filter((it) => it.channel === "whatsapp" && it.provider === "whatsapp-connect")
      .forEach((it) => {
        if (fetchedDeviceStatusRef.current.has(it.id)) return;
        fetchedDeviceStatusRef.current.add(it.id);
        deviceStatusMutation.mutate(it.id);
      });
  }, [token, integrations]);

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
  const isInstagramMetaCredModal = Boolean(
    activeCredIntegration && activeCredIntegration.channel === "instagram" && activeCredIntegration.provider === "meta"
  );

  const openCredentials = (integrationId: string) => {
    setCredOpenFor(integrationId);
    setCredError("");
    setCredJson("{}");
    setWcCredForm({ deviceId: "", webhookSecret: "", tenantId: "" });
    setIgCredForm({ instagramBusinessAccountId: "", pageId: "", pageAccessToken: "" });
  };

  const deleteIntegrationTarget = deleteIntegrationId ? integrations.find((it) => it.id === deleteIntegrationId) || null : null;

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
            <p className="text-xl font-extrabold text-primary-dark">{safeKpis.escalations}</p>
            <p className="text-[10px] uppercase font-semibold text-muted-foreground">Escalaciones</p>
          </div>
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <p className="font-semibold text-sm">Tu cuenta</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Nombre</Label>
            <Input
              value={userForm.name}
              onChange={(e) => setUserForm((s) => ({ ...s, name: e.target.value }))}
              className={cn(profileFieldErrors.name && "border-destructive focus-visible:ring-destructive")}
              aria-invalid={Boolean(profileFieldErrors.name)}
            />
            <FieldErrorText error={profileFieldErrors.name} />
            <Label className="text-xs">Teléfono</Label>
            <Input
              value={userForm.phone}
              onChange={(e) => setUserForm((s) => ({ ...s, phone: e.target.value }))}
              placeholder="+57..."
              className={cn(profileFieldErrors.phone && "border-destructive focus-visible:ring-destructive")}
              aria-invalid={Boolean(profileFieldErrors.phone)}
            />
            <FieldErrorText error={profileFieldErrors.phone} />
            {/* Canal por defecto (deshabilitado) porque de momento solo hay un canal disponible: WhatsApp.
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
              <option value="instagram">Instagram</option>
            </select>
            */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <Label className="text-xs">Link de calendario de Google</Label>
              <GoogleCalendarLinkHelpDialog />
            </div>
            {profileLoading ? (
              <p className="text-xs text-muted-foreground">Cargando enlace...</p>
            ) : calendarUrlEditing ? (
              <div className="space-y-2">
                <Input
                  type="url"
                  value={userForm.calendarSchedulingUrl || savedCalendarUrl}
                  onChange={(e) => setUserForm((s) => ({ ...s, calendarSchedulingUrl: e.target.value }))}
                  placeholder="https://calendar.app.google/..."
                  autoFocus
                  className={cn(profileFieldErrors.calendarSchedulingUrl && "border-destructive focus-visible:ring-destructive")}
                  aria-invalid={Boolean(profileFieldErrors.calendarSchedulingUrl)}
                />
                <FieldErrorText error={profileFieldErrors.calendarSchedulingUrl} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => {
                    setCalendarUrlEditing(false);
                    setUserForm((s) => ({ ...s, calendarSchedulingUrl: savedCalendarUrl }));
                  }}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 space-y-2">
                {savedCalendarUrl ? (
                  <a
                    href={savedCalendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-primary-dark break-all hover:underline"
                  >
                    {savedCalendarUrl}
                  </a>
                ) : (
                  <p className="text-xs text-muted-foreground">Aún no tienes un enlace de calendario configurado.</p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setUserForm((s) => ({ ...s, calendarSchedulingUrl: savedCalendarUrl }));
                    setCalendarUrlEditing(true);
                  }}
                >
                  {savedCalendarUrl ? "Cambiar URL" : "Agregar URL"}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-success" />
            <p className="font-semibold text-sm">Datos del negocio</p>
          </div>
          <div className="grid gap-2">
            <Input placeholder="Nombre comercial" value={bizForm.tradeName || ""} onChange={(e) => setBizForm((s) => ({ ...s, tradeName: e.target.value }))} className={cn(profileFieldErrors.tradeName && "border-destructive")} />
            <FieldErrorText error={profileFieldErrors.tradeName} />
            <Input placeholder="Razón social" value={bizForm.legalName || ""} onChange={(e) => setBizForm((s) => ({ ...s, legalName: e.target.value }))} className={cn(profileFieldErrors.legalName && "border-destructive")} />
            <FieldErrorText error={profileFieldErrors.legalName} />
            <Input placeholder="NIT / ID fiscal" value={bizForm.taxId || ""} onChange={(e) => setBizForm((s) => ({ ...s, taxId: e.target.value }))} className={cn(profileFieldErrors.taxId && "border-destructive")} />
            <FieldErrorText error={profileFieldErrors.taxId} />
            <Input placeholder="Teléfono del negocio" value={bizForm.businessPhone || ""} onChange={(e) => setBizForm((s) => ({ ...s, businessPhone: e.target.value }))} className={cn(profileFieldErrors.businessPhone && "border-destructive")} />
            <FieldErrorText error={profileFieldErrors.businessPhone} />
            <Input placeholder="Email del negocio" value={bizForm.businessEmail || ""} onChange={(e) => setBizForm((s) => ({ ...s, businessEmail: e.target.value }))} className={cn(profileFieldErrors.businessEmail && "border-destructive")} />
            <FieldErrorText error={profileFieldErrors.businessEmail} />
            <Input placeholder="Sitio web" value={bizForm.website || ""} onChange={(e) => setBizForm((s) => ({ ...s, website: e.target.value }))} className={cn(profileFieldErrors.website && "border-destructive")} />
            <FieldErrorText error={profileFieldErrors.website} />
            <Input placeholder="Dirección" value={bizForm.addressLine || ""} onChange={(e) => setBizForm((s) => ({ ...s, addressLine: e.target.value }))} className={cn(profileFieldErrors.addressLine && "border-destructive")} />
            <FieldErrorText error={profileFieldErrors.addressLine} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Input placeholder="Ciudad" value={bizForm.city || ""} onChange={(e) => setBizForm((s) => ({ ...s, city: e.target.value }))} className={cn(profileFieldErrors.city && "border-destructive")} />
                <FieldErrorText error={profileFieldErrors.city} />
              </div>
              <div>
                <Input placeholder="Estado / Depto" value={bizForm.state || ""} onChange={(e) => setBizForm((s) => ({ ...s, state: e.target.value }))} className={cn(profileFieldErrors.state && "border-destructive")} />
                <FieldErrorText error={profileFieldErrors.state} />
              </div>
            </div>
            <Input placeholder="País" value={bizForm.country || ""} onChange={(e) => setBizForm((s) => ({ ...s, country: e.target.value }))} className={cn(profileFieldErrors.country && "border-destructive")} />
            <FieldErrorText error={profileFieldErrors.country} />
            <Textarea placeholder="Descripción corta del negocio" value={bizForm.description || ""} onChange={(e) => setBizForm((s) => ({ ...s, description: e.target.value }))} rows={3} className={cn(profileFieldErrors.description && "border-destructive")} />
            <FieldErrorText error={profileFieldErrors.description} />
            <Input placeholder="URL del logo" value={bizForm.logoUrl || ""} onChange={(e) => setBizForm((s) => ({ ...s, logoUrl: e.target.value }))} className={cn(profileFieldErrors.logoUrl && "border-destructive")} />
            <FieldErrorText error={profileFieldErrors.logoUrl} />
          </div>
          <Button className="w-full" disabled={!token || profileLoading || !dirty || saveProfileMutation.isPending} onClick={() => saveProfileMutation.mutate()}>
            <Save className="w-4 h-4 mr-2" />
            {saveProfileMutation.isPending ? "Guardando..." : "Guardar perfil"}
          </Button>
          <FormErrorAlert title="No se pudo guardar el perfil" message={profileFormError} />
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-card border border-border space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-info" />
              <p className="font-semibold text-sm">Integraciones</p>
            </div>
            <Dialog open={integrationDialogOpen} onOpenChange={setIntegrationDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Canal
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Nueva integración</DialogTitle>
                  <DialogDescription>Define el canal y el proveedor (por defecto WhatsApp connect).</DialogDescription>
                </DialogHeader>
                <NewIntegrationForm
                  key={integrationFormKey}
                  disabled={createIntegrationMutation.isPending}
                  onSubmit={(body) => createIntegrationMutation.mutate(body)}
                />
              </DialogContent>
            </Dialog>
          </div>
          <p className="text-xs text-muted-foreground">
            Conecta tus canales (WhatsApp, Instagram, etc.). El bot solo responde cuando la integración está <strong>activa</strong> y tiene credenciales guardadas.
          </p>
          {integrations.length === 0 ? (
            <p className="text-xs text-muted-foreground">No hay integraciones. Pulsa <strong>Canal</strong> para añadir una.</p>
          ) : (
            <Accordion type="single" collapsible className="space-y-2">
              {integrations.map((it) => (
                <IntegrationAccordionItem
                  key={it.id}
                  integration={it}
                  channelTitle={channelLabel(it.channel)}
                  metaInstagramWebhookUrl={metaInstagramWebhookUrl}
                  lastQr={lastQrByIntegrationId[it.id]}
                  lastQrError={lastQrErrorByIntegrationId[it.id]}
                  deviceStatus={deviceStatusByIntegrationId[it.id]}
                  qrLoading={qrLoadingIntegrationId === it.id}
                  deviceStatusLoading={deviceStatusLoadingIntegrationId === it.id}
                  sendTestPending={sendTestMutation.isPending}
                  patchPending={patchIntegrationMutation.isPending}
                  onOpenCredentials={() => openCredentials(it.id)}
                  onGenerateQr={() => qrLinkMutation.mutate(it.id)}
                  onViewQr={() => openQrViewer(it.id)}
                  onSendTest={() => {
                    const to = window.prompt("Número destino (con código de país):", "");
                    if (!to) return;
                    const text = window.prompt("Mensaje de prueba:", "Hola desde Car Advisor Bot");
                    if (!text) return;
                    sendTestMutation.mutate({ integrationId: it.id, to, text });
                  }}
                  onActivate={() => patchIntegrationMutation.mutate({ id: it.id, status: "active" })}
                  onDeactivate={() => patchIntegrationMutation.mutate({ id: it.id, status: "disabled" })}
                  onDelete={() => setDeleteIntegrationId(it.id)}
                />
              ))}
            </Accordion>
          )}
        </div>

        <AlertDialog open={Boolean(deleteIntegrationId)} onOpenChange={(open) => !open && setDeleteIntegrationId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar esta integración?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteIntegrationTarget
                  ? `Se ocultará ${channelLabel(deleteIntegrationTarget.channel)} (${deleteIntegrationTarget.provider}) y el bot dejará de usarla. Podrás volver a conectar el mismo canal después.`
                  : "La integración dejará de mostrarse y el bot no la usará. Podrás volver a conectar el mismo canal después."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteIntegrationMutation.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={!deleteIntegrationId || deleteIntegrationMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (deleteIntegrationId) deleteIntegrationMutation.mutate(deleteIntegrationId);
                }}
              >
                {deleteIntegrationMutation.isPending ? "Eliminando..." : "Eliminar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
              <DialogTitle>
                {isWhatsAppConnectCredModal
                  ? "Credenciales WhatsApp Connect"
                  : isInstagramMetaCredModal
                    ? "Credenciales Instagram (Meta)"
                    : "Credenciales (JSON)"}
              </DialogTitle>
              <DialogDescription>Se guardan cifradas en el servidor y no se vuelven a mostrar.</DialogDescription>
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
                  <Label className="text-xs">Tenant ID</Label>
                  <Input
                    className="mt-1"
                    value={wcCredForm.tenantId}
                    onChange={(e) => setWcCredForm((s) => ({ ...s, tenantId: e.target.value }))}
                    placeholder="tenant_123"
                  />
                </div>
              </div>
            ) : isInstagramMetaCredModal ? (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Instagram Business Account ID *</Label>
                  <Input
                    className="mt-1"
                    value={igCredForm.instagramBusinessAccountId}
                    onChange={(e) => setIgCredForm((s) => ({ ...s, instagramBusinessAccountId: e.target.value }))}
                    placeholder="Debe coincidir con entry.id del webhook"
                  />
                </div>
                <div>
                  <Label className="text-xs">Page ID *</Label>
                  <Input
                    className="mt-1"
                    value={igCredForm.pageId}
                    onChange={(e) => setIgCredForm((s) => ({ ...s, pageId: e.target.value }))}
                    placeholder="ID de la página de Facebook vinculada"
                  />
                </div>
                <div>
                  <Label className="text-xs">Page Access Token *</Label>
                  <Input
                    className="mt-1"
                    type="password"
                    autoComplete="new-password"
                    value={igCredForm.pageAccessToken}
                    onChange={(e) => setIgCredForm((s) => ({ ...s, pageAccessToken: e.target.value }))}
                    placeholder="Token con permisos de mensajería Instagram"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  URL del webhook (compartida por la app; el ruteo a tu cuenta lo hace el ID de Instagram Business):{" "}
                  <code className="select-all break-all">{metaInstagramWebhookUrl}</code>
                </p>
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
                if (isInstagramMetaCredModal) {
                  const instagramBusinessAccountId = igCredForm.instagramBusinessAccountId.trim();
                  const pageId = igCredForm.pageId.trim();
                  const pageAccessToken = igCredForm.pageAccessToken.trim();
                  if (!instagramBusinessAccountId || !pageId || !pageAccessToken) {
                    setCredError("Instagram Business Account ID, Page ID y Page Access Token son obligatorios.");
                    return;
                  }
                  setCredError("");
                  saveCredsMutation.mutate({
                    id: credOpenFor,
                    payload: { instagramBusinessAccountId, pageId, pageAccessToken },
                  });
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
            <FormErrorAlert title="No se pudieron guardar las credenciales" message={credError} />
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
            <button type="button" onClick={() => navigate("/perfil/notificaciones")} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40">
              <div className="w-9 h-9 rounded-xl bg-warning/10 grid place-items-center text-warning">
                <Bell className="w-4 h-4" />
              </div>
              <span className="flex-1 text-sm font-medium">Notificaciones</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
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
          <Dialog
            open={deleteDialogOpen}
            onOpenChange={(open) => {
              setDeleteDialogOpen(open);
              if (!open) setDeleteFormError("");
            }}
          >
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
              <FormErrorAlert title="No se pudo eliminar la cuenta" message={deleteFormError} />
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

const integrationStatusLabel: Record<IntegrationDto["status"], string> = {
  active: "Activa",
  disabled: "Desactivada",
  draft: "Borrador",
  error: "Error",
};

const integrationStatusVariant = (status: IntegrationDto["status"]) => {
  if (status === "active") return "default" as const;
  if (status === "error") return "destructive" as const;
  return "secondary" as const;
};

const integrationHeaderTitle = (channelTitle: string, displayName?: string | null) => {
  const name = displayName?.trim();
  if (!name) return channelTitle;
  if (name.localeCompare(channelTitle, undefined, { sensitivity: "accent" }) === 0) return channelTitle;
  return `${channelTitle} · ${name}`;
};

function IntegrationAccordionItem({
  integration,
  channelTitle,
  metaInstagramWebhookUrl,
  lastQr,
  lastQrError,
  deviceStatus,
  qrLoading,
  deviceStatusLoading,
  sendTestPending,
  patchPending,
  onOpenCredentials,
  onGenerateQr,
  onViewQr,
  onSendTest,
  onActivate,
  onDeactivate,
  onDelete,
}: {
  integration: IntegrationDto;
  channelTitle: string;
  metaInstagramWebhookUrl: string;
  lastQr?: { url: string; expiresAt: string };
  lastQrError?: string;
  deviceStatus?: { status: "ONLINE" | "OFFLINE" | "UNKNOWN"; updatedAt: string };
  qrLoading: boolean;
  deviceStatusLoading: boolean;
  sendTestPending: boolean;
  patchPending: boolean;
  onOpenCredentials: () => void;
  onGenerateQr: () => void;
  onViewQr: () => void;
  onSendTest: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  const isWhatsAppConnect = integration.channel === "whatsapp" && integration.provider === "whatsapp-connect";
  const isInstagramMeta = integration.channel === "instagram" && integration.provider === "meta";
  const credentialLabel = integration.hasActiveCredential ? "credenciales OK" : "sin credenciales";
  const qrExpired = lastQr ? new Date(lastQr.expiresAt).getTime() <= Date.now() : false;
  const headerTitle = integrationHeaderTitle(channelTitle, integration.displayName);

  return (
    <AccordionItem value={integration.id} className="rounded-xl border border-border px-3 border-b overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-0.5">
        <AccordionTrigger
          className="min-w-0 py-3 hover:no-underline overflow-hidden justify-start gap-2 [&>svg]:ml-auto [&>svg]:shrink-0"
          aria-label={`${headerTitle} — ${integrationStatusLabel[integration.status]}`}
        >
          <div className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 overflow-hidden">
            <Badge
              variant={integrationStatusVariant(integration.status)}
              className="shrink-0 max-w-[5.5rem] truncate text-[10px]"
              title={integrationStatusLabel[integration.status]}
            >
              {integrationStatusLabel[integration.status]}
            </Badge>
            <span className="block min-w-0 truncate text-sm font-semibold" title={headerTitle}>
              {headerTitle}
            </span>
          </div>
        </AccordionTrigger>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              aria-label="Opciones de integración"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem className="gap-2" onSelect={onOpenCredentials}>
              <KeyRound className="w-4 h-4" />
              Credenciales
            </DropdownMenuItem>
            {isWhatsAppConnect ? (
              <>
                <DropdownMenuItem className="gap-2" onSelect={onGenerateQr} disabled={qrLoading}>
                  <QrCode className="w-4 h-4" />
                  {qrLoading ? "Generando QR..." : "Generar QR"}
                </DropdownMenuItem>
                {lastQr?.url ? (
                  <DropdownMenuItem className="gap-2" onSelect={onViewQr}>
                    <QrCode className="w-4 h-4" />
                    Ver QR
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem className="gap-2" onSelect={onSendTest} disabled={sendTestPending}>
                  <FlaskConical className="w-4 h-4" />
                  Probar envío
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            {integration.status === "active" ? (
              <DropdownMenuItem className="gap-2" onSelect={onDeactivate} disabled={patchPending}>
                <PowerOff className="w-4 h-4" />
                Desactivar
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="gap-2" onSelect={onActivate} disabled={patchPending}>
                <Power className="w-4 h-4" />
                Activar
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onSelect={onDelete}>
              <Trash2 className="w-4 h-4" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <AccordionContent className="pb-3">
        <div className="space-y-2 text-[11px] text-muted-foreground">
          <div>
            <p className="text-sm font-semibold text-foreground">{headerTitle}</p>
            <p>{integration.provider} · {credentialLabel}</p>
          </div>
          {integration.lastError ? <p className="text-destructive">{integration.lastError}</p> : null}
          {isInstagramMeta ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2">
              <p>
                Tus credenciales son solo de tu cuenta de Instagram/Página. En Meta Developer, suscribe el webhook <strong>instagram</strong> a esta URL:
              </p>
              <p className="font-mono break-all select-all">{metaInstagramWebhookUrl}</p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(metaInstagramWebhookUrl);
                    toast.success("URL copiada.");
                  } catch {
                    toast.error("No se pudo copiar la URL.");
                  }
                }}
              >
                Copiar URL webhook
              </Button>
            </div>
          ) : null}
          {isWhatsAppConnect ? (
            <div className="space-y-1">
              {deviceStatusLoading && !deviceStatus ? <p>Consultando estado del device...</p> : null}
              {lastQrError ? <p className="text-destructive">{lastQrError}</p> : null}
              {lastQr?.expiresAt ? (
                <p>{qrExpired ? "QR expirado. Genera uno nuevo desde el menú." : `QR vigente hasta ${new Date(lastQr.expiresAt).toLocaleString()}`}</p>
              ) : null}
              {deviceStatus ? (
                <p>
                  Device {deviceStatus.status} · actualizado {new Date(deviceStatus.updatedAt).toLocaleString()}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </AccordionContent>
    </AccordionItem>
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
  const [provider, setProvider] = useState("whatsapp-connect");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (channel === "whatsapp") {
      setProvider((prev) => (prev === "meta" || prev === "whatsapp-connect" ? prev : "whatsapp-connect"));
      return;
    }
    if (channel === "instagram") {
      setProvider("meta");
      return;
    }
    if (!provider.trim()) setProvider("meta");
  }, [channel, provider]);

  const isWhatsApp = channel === "whatsapp";
  const isInstagram = channel === "instagram";

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Canal</Label>
        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm mt-1" value={channel} onChange={(e) => setChannel(e.target.value as IntegrationDto["channel"])}>
          <option value="whatsapp">WhatsApp</option>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
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
        ) : isInstagram ? (
          <Input className="mt-1 bg-muted" value="meta" readOnly />
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
