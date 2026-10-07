import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut,
  ChevronRight,
  Building2,
  Link2,
  Save,
  AlertTriangle,
  MessageCircle,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { accountApi, type BusinessProfileDto } from "@/services/account";
import { crmApi } from "@/services/crm";
import { integrationsApi } from "@/services/integrations";
import {
  isWhatsAppMetaConnected,
  selectWhatsAppMetaIntegration,
  whatsAppMetaDisplayPhone,
} from "@/lib/whatsappMeta";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import DeleteAccount from "@/components/deleteAccount";
import { Label } from "@/components/ui/label";
import { GoogleCalendarLinkHelpDialog } from "@/components/GoogleCalendarLinkHelpDialog";
import { FieldErrorText, FormErrorAlert } from "@/components/FormErrorAlert";
import {
  GOOGLE_CALENDAR_URL_ERROR,
  isGoogleCalendarSchedulingUrl,
} from "@/lib/calendarUrl";
import { normalizeApiError } from "@/lib/formErrors";
import { cn } from "@/lib/utils";

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

  const { data: integrations = [], isLoading: integrationsLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => integrationsApi.list(token!),
    enabled: Boolean(token),
  });

  const [userForm, setUserForm] = useState({
    name: "",
    phone: "",
    defaultPlatform: "",
    calendarSchedulingUrl: "",
  });
  const [profileFormError, setProfileFormError] = useState("");
  const [profileFieldErrors, setProfileFieldErrors] = useState<
    Record<string, string>
  >({});
  const [deleteFormError, setDeleteFormError] = useState("");
  const [bizForm, setBizForm] = useState<BusinessProfileDto>(emptyBusiness);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
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
  const whatsappMeta = selectWhatsAppMetaIntegration(integrations);
  const whatsappConnected = isWhatsAppMetaConnected(whatsappMeta);
  const whatsappPhone = whatsAppMetaDisplayPhone(whatsappMeta);

  const saveProfileMutation = useMutation({
    mutationFn: () => {
      const calendarSchedulingUrl = (
        userForm.calendarSchedulingUrl || savedCalendarUrl
      ).trim();
      if (!isGoogleCalendarSchedulingUrl(calendarSchedulingUrl)) {
        throw new Error(GOOGLE_CALENDAR_URL_ERROR);
      }
      return accountApi.patchProfile(token!, {
        user: {
          name: userForm.name.trim(),
          phone: userForm.phone.trim() || null,
          defaultPlatform: (userForm.defaultPlatform || null) as
            | "whatsapp"
            | "facebook"
            | "telegram"
            | "web"
            | "api"
            | "instagram"
            | null,
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
      if (
        error instanceof Error &&
        error.message === GOOGLE_CALENDAR_URL_ERROR
      ) {
        setProfileFormError("");
        setProfileFieldErrors({ calendarSchedulingUrl: error.message });
        return;
      }
      const { formError, fieldErrors } = normalizeApiError(
        error,
        "No se pudo guardar el perfil.",
        {
          knownFields: PROFILE_KNOWN_FIELDS,
        },
      );
      setProfileFormError(formError);
      setProfileFieldErrors(fieldErrors);
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () =>
      accountApi.deleteAccount(token!, { confirmText: deleteConfirmText }),
    onSuccess: async () => {
      setDeleteFormError("");
      await logout();
      navigate("/login", { replace: true });
    },
    onError: (error) => {
      const { formError } = normalizeApiError(
        error,
        "No se pudo eliminar la cuenta.",
      );
      setDeleteFormError(formError);
    },
  });

  const safeKpis = {
    activeChats: Number(kpis?.activeChats) || 0,
    newLeads: Number(kpis?.newLeads) || 0,
    escalations: Number(kpis?.escalations) || 0,
  };

  const { userDirty, businessDirty } = useMemo(() => {
    if (!profile) return { userDirty: false, businessDirty: false };
    const calendarValue = (
      userForm.calendarSchedulingUrl || savedCalendarUrl
    ).trim();
    const userDirty =
      profile.user.name !== userForm.name.trim() ||
      (profile.user.phone || "") !== (userForm.phone.trim() || "") ||
      (profile.user.defaultPlatform || "") !==
        (userForm.defaultPlatform || "") ||
      savedCalendarUrl !== calendarValue;
    const businessDirty =
      JSON.stringify(profile.business || {}) !==
      JSON.stringify({ ...emptyBusiness, ...bizForm });
    return { userDirty, businessDirty };
  }, [profile, userForm, bizForm, savedCalendarUrl]);

  const renderSaveProfileButton = () => (
    <div className="pt-2 space-y-2">
      <Button
        className="w-full"
        disabled={!token || profileLoading || saveProfileMutation.isPending}
        onClick={() => saveProfileMutation.mutate()}
      >
        <Save className="w-4 h-4 mr-2" />
        {saveProfileMutation.isPending ? "Guardando..." : "Guardar perfil"}
      </Button>
      <FormErrorAlert
        title="No se pudo guardar el perfil"
        message={profileFormError}
      />
    </div>
  );

  return (
    <>
      <div className="px-4 py-5 space-y-5">
        <div className="bg-card rounded-2xl p-5 shadow-card border border-border flex flex-col items-center text-center">
          <Avatar
            name={user?.name || "Usuario"}
            color="hsl(162 75% 30%)"
            size="lg"
          />
          <h2 className="font-bold text-lg mt-3">{user?.name || "Usuario"}</h2>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
          {bizForm.tradeName ? (
            <p className="text-xs font-semibold text-primary-dark mt-1">
              {bizForm.tradeName}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Completa los datos de tu negocio abajo
            </p>
          )}
        </div>
        <Accordion type="multiple" className="space-y-3">
          <AccordionItem
            value="cuenta"
            className="border-0 bg-card rounded-2xl px-4 shadow-card border border-border"
          >
            <AccordionTrigger className="hover:no-underline py-4">
              <span className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                <span className="font-semibold text-sm">Tu cuenta</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 pb-1">
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={userForm.name}
                  onChange={(e) =>
                    setUserForm((s) => ({ ...s, name: e.target.value }))
                  }
                  className={cn(
                    profileFieldErrors.name &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                  aria-invalid={Boolean(profileFieldErrors.name)}
                />
                <FieldErrorText error={profileFieldErrors.name} />
                <Label className="text-xs">Teléfono</Label>
                <Input
                  value={userForm.phone}
                  onChange={(e) =>
                    setUserForm((s) => ({ ...s, phone: e.target.value }))
                  }
                  placeholder="+57..."
                  className={cn(
                    profileFieldErrors.phone &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                  aria-invalid={Boolean(profileFieldErrors.phone)}
                />
                <FieldErrorText error={profileFieldErrors.phone} />
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Label className="text-xs">
                    Link de calendario de Google
                  </Label>
                  <GoogleCalendarLinkHelpDialog />
                </div>
                {profileLoading ? (
                  <p className="text-xs text-muted-foreground">
                    Cargando enlace...
                  </p>
                ) : calendarUrlEditing ? (
                  <div className="space-y-2">
                    <Input
                      type="url"
                      value={userForm.calendarSchedulingUrl || savedCalendarUrl}
                      onChange={(e) =>
                        setUserForm((s) => ({
                          ...s,
                          calendarSchedulingUrl: e.target.value,
                        }))
                      }
                      placeholder="https://calendar.app.google/..."
                      autoFocus
                      className={cn(
                        profileFieldErrors.calendarSchedulingUrl &&
                          "border-destructive focus-visible:ring-destructive",
                      )}
                      aria-invalid={Boolean(
                        profileFieldErrors.calendarSchedulingUrl,
                      )}
                    />
                    <FieldErrorText
                      error={profileFieldErrors.calendarSchedulingUrl}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => {
                        setCalendarUrlEditing(false);
                        setUserForm((s) => ({
                          ...s,
                          calendarSchedulingUrl: savedCalendarUrl,
                        }));
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
                      <p className="text-xs text-muted-foreground">
                        Aún no tienes un enlace de calendario configurado.
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        setUserForm((s) => ({
                          ...s,
                          calendarSchedulingUrl: savedCalendarUrl,
                        }));
                        setCalendarUrlEditing(true);
                      }}
                    >
                      {savedCalendarUrl ? "Cambiar URL" : "Agregar URL"}
                    </Button>
                  </div>
                )}
                {userDirty ? renderSaveProfileButton() : null}
              </div>
              <div className="pt-2 space-y-2">
                <DeleteAccount
                  deleteDialogOpen={deleteDialogOpen}
                  setDeleteDialogOpen={setDeleteDialogOpen}
                  deleteFormError={deleteFormError}
                  setDeleteFormError={setDeleteFormError}
                  deleteConfirmText={deleteConfirmText}
                  setDeleteConfirmText={setDeleteConfirmText}
                  deleteAccountMutation={deleteAccountMutation}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="negocio"
            className="border-0 bg-card rounded-2xl px-4 shadow-card border border-border"
          >
            <AccordionTrigger className="hover:no-underline py-4">
              <span className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-success" />
                <span className="font-semibold text-sm">Datos del negocio</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-2 pb-1">
                <Input
                  placeholder="Nombre comercial"
                  value={bizForm.tradeName || ""}
                  onChange={(e) =>
                    setBizForm((s) => ({ ...s, tradeName: e.target.value }))
                  }
                  className={cn(
                    profileFieldErrors.tradeName && "border-destructive",
                  )}
                />
                <FieldErrorText error={profileFieldErrors.tradeName} />
                <Input
                  placeholder="Razón social"
                  value={bizForm.legalName || ""}
                  onChange={(e) =>
                    setBizForm((s) => ({ ...s, legalName: e.target.value }))
                  }
                  className={cn(
                    profileFieldErrors.legalName && "border-destructive",
                  )}
                />
                <FieldErrorText error={profileFieldErrors.legalName} />
                <Input
                  placeholder="NIT / ID fiscal"
                  value={bizForm.taxId || ""}
                  onChange={(e) =>
                    setBizForm((s) => ({ ...s, taxId: e.target.value }))
                  }
                  className={cn(
                    profileFieldErrors.taxId && "border-destructive",
                  )}
                />
                <FieldErrorText error={profileFieldErrors.taxId} />
                <Input
                  placeholder="Teléfono del negocio"
                  value={bizForm.businessPhone || ""}
                  onChange={(e) =>
                    setBizForm((s) => ({ ...s, businessPhone: e.target.value }))
                  }
                  className={cn(
                    profileFieldErrors.businessPhone && "border-destructive",
                  )}
                />
                <FieldErrorText error={profileFieldErrors.businessPhone} />
                <Input
                  placeholder="Email del negocio"
                  value={bizForm.businessEmail || ""}
                  onChange={(e) =>
                    setBizForm((s) => ({ ...s, businessEmail: e.target.value }))
                  }
                  className={cn(
                    profileFieldErrors.businessEmail && "border-destructive",
                  )}
                />
                <FieldErrorText error={profileFieldErrors.businessEmail} />
                <Input
                  placeholder="Sitio web"
                  value={bizForm.website || ""}
                  onChange={(e) =>
                    setBizForm((s) => ({ ...s, website: e.target.value }))
                  }
                  className={cn(
                    profileFieldErrors.website && "border-destructive",
                  )}
                />
                <FieldErrorText error={profileFieldErrors.website} />
                <Input
                  placeholder="Dirección"
                  value={bizForm.addressLine || ""}
                  onChange={(e) =>
                    setBizForm((s) => ({ ...s, addressLine: e.target.value }))
                  }
                  className={cn(
                    profileFieldErrors.addressLine && "border-destructive",
                  )}
                />
                <FieldErrorText error={profileFieldErrors.addressLine} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Input
                      placeholder="Ciudad"
                      value={bizForm.city || ""}
                      onChange={(e) =>
                        setBizForm((s) => ({ ...s, city: e.target.value }))
                      }
                      className={cn(
                        profileFieldErrors.city && "border-destructive",
                      )}
                    />
                    <FieldErrorText error={profileFieldErrors.city} />
                  </div>
                  <div>
                    <Input
                      placeholder="Estado / Depto"
                      value={bizForm.state || ""}
                      onChange={(e) =>
                        setBizForm((s) => ({ ...s, state: e.target.value }))
                      }
                      className={cn(
                        profileFieldErrors.state && "border-destructive",
                      )}
                    />
                    <FieldErrorText error={profileFieldErrors.state} />
                  </div>
                </div>
                <Input
                  placeholder="País"
                  value={bizForm.country || ""}
                  onChange={(e) =>
                    setBizForm((s) => ({ ...s, country: e.target.value }))
                  }
                  className={cn(
                    profileFieldErrors.country && "border-destructive",
                  )}
                />
                <FieldErrorText error={profileFieldErrors.country} />
                <Textarea
                  placeholder="Descripción corta del negocio"
                  value={bizForm.description || ""}
                  onChange={(e) =>
                    setBizForm((s) => ({ ...s, description: e.target.value }))
                  }
                  rows={3}
                  className={cn(
                    profileFieldErrors.description && "border-destructive",
                  )}
                />
                <FieldErrorText error={profileFieldErrors.description} />
                <Input
                  placeholder="URL del logo"
                  value={bizForm.logoUrl || ""}
                  onChange={(e) =>
                    setBizForm((s) => ({ ...s, logoUrl: e.target.value }))
                  }
                  className={cn(
                    profileFieldErrors.logoUrl && "border-destructive",
                  )}
                />
                <FieldErrorText error={profileFieldErrors.logoUrl} />
                {businessDirty ? renderSaveProfileButton() : null}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <button
          type="button"
          onClick={() => navigate("/perfil/integraciones")}
          className="w-full bg-card rounded-2xl p-4 shadow-card border border-border text-left hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-5 h-5 text-info" />
            <p className="font-semibold text-sm flex-1">Integraciones</p>
            <span className="text-xs font-semibold text-primary-dark">
              Gestionar
            </span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-primary grid place-items-center text-primary-foreground shadow-green shrink-0">
              <MessageCircle className="w-5 h-5" strokeWidth={2.4} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">WhatsApp</p>
              {integrationsLoading ? (
                <p className="text-xs text-muted-foreground">
                  Cargando estado...
                </p>
              ) : whatsappConnected ? (
                <p className="text-xs text-muted-foreground break-all">
                  Conectado{whatsappPhone ? ` · ${whatsappPhone}` : ""}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">No conectado</p>
              )}
            </div>
          </div>
        </button>

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

        <p className="text-center text-[10px] text-muted-foreground">
          AutoBot · Perfil y cuenta
        </p>
      </div>
    </>
  );
}
