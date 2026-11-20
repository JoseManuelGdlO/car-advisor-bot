import { useNavigate } from "react-router-dom";
import { HelpCircle, ChevronRight, Bot, Clock3, Ban, Bell, Shield, Users, type LucideIcon } from "lucide-react";
import { BotBlacklistDialog } from "@/components/BotBlacklistDialog";
import { useAuth } from "@/context/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { crmApi } from "@/services/crm";
import { Switch } from "@/components/ui/switch";
import { sellersApi } from "@/services/sellers";

type ConfigSection = {
  to: string;
  icon: LucideIcon;
  title: string;
  color: string;
  subtitle?: (count: number) => string;
};

const faqSection: ConfigSection = {
  to: "/config/faqs",
  icon: HelpCircle,
  title: "Preguntas frecuentes",
  color: "bg-info/10 text-info",
  subtitle: (n: number) => (n === 1 ? "1 pregunta" : `${n} preguntas`),
};

const adminSections: ConfigSection[] = [
  {
    to: "/config/bot",
    icon: Clock3,
    title: "Horario del bot",
    color: "bg-accent text-primary-dark",
  },
  {
    to: "/config/comportamiento-bot",
    icon: Bot,
    title: "Comportamiento del bot",
    color: "bg-accent text-primary-dark",
  },
];

export default function Configuracion() {
  const navigate = useNavigate();
  const { token, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  // Bot, lista negra y vendedores son del tenant: el vendedor no los consulta (el API responde 403).
  // Las FAQs se administran igual que el catálogo: admin y vendedor leen y escriben.
  const adminEnabled = Boolean(token) && isAdmin;
  const { data: faqs = [] } = useQuery({ queryKey: ["faqs"], queryFn: () => crmApi.getFaqs(token!), enabled: Boolean(token) });
  const { data: blacklist = [] } = useQuery({
    queryKey: ["phone-blacklist"],
    queryFn: () => crmApi.getBlacklist(token!),
    enabled: adminEnabled,
  });
  const { data: activeSellers = [] } = useQuery({
    queryKey: ["sellers", "active"],
    queryFn: () => sellersApi.list(token!),
    enabled: adminEnabled,
  });
  const { data: botSettings } = useQuery({ queryKey: ["bot-settings"], queryFn: () => crmApi.getBotSettings(token!), enabled: adminEnabled });
  const botEnabled = botSettings?.isEnabled ?? true;
  const toggleBotMutation = useMutation({
    mutationFn: async (nextEnabled: boolean) => crmApi.updateBotSettings(token!, { isEnabled: nextEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bot-settings"] });
    },
  });
  const menuSections = [faqSection, ...(isAdmin ? adminSections : [])];

  return (
    <>
      <div className="px-4 py-5 space-y-5">
        {/* Bot status */}
        {isAdmin ? (
        <div className="bg-card rounded-2xl p-4 shadow-card border border-border flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-primary grid place-items-center text-primary-foreground shadow-green">
            <Bot className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-bold text-sm">AutoBot</p>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  botEnabled ? "text-success bg-success/10" : "text-muted-foreground bg-muted"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${botEnabled ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                {botEnabled ? "ACTIVO" : "APAGADO"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {botEnabled ? "Respondiendo en WhatsApp y Facebook" : "Sin respuestas automáticas"}
            </p>
          </div>
          <Switch
            checked={botEnabled}
            disabled={toggleBotMutation.isPending || !token}
            onCheckedChange={(checked) => toggleBotMutation.mutate(checked)}
          />
        </div>
        ) : null}

        <div className="space-y-2.5">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => navigate("/vendedores")}
              className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3.5 text-left shadow-card transition-colors hover:bg-muted/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-dark">
                <Users className="h-4 w-4" />
              </div>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Vendedores</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {activeSellers.length === 1 ? "1 vendedor activo" : `${activeSellers.length} vendedores activos`}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ) : null}

          {menuSections.map((s) => (
            <button
              key={s.to}
              type="button"
              onClick={() => navigate(s.to)}
              className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3.5 text-left shadow-card transition-colors hover:bg-muted/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${s.color}`}>
                <s.icon className="h-4 w-4" />
              </div>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{s.title}</span>
                {s.subtitle ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{s.subtitle(faqs.length)}</span>
                ) : null}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}

          {isAdmin ? (
          <BotBlacklistDialog>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3.5 text-left shadow-card transition-colors hover:bg-muted/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
                <Ban className="h-4 w-4" />
              </div>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Lista negra</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {blacklist.length === 1 ? "1 número bloqueado" : `${blacklist.length} números bloqueados`}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </BotBlacklistDialog>
          ) : null}

          <button
            type="button"
            onClick={() => navigate("/perfil/notificaciones")}
            className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3.5 text-left shadow-card transition-colors hover:bg-muted/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning">
              <Bell className="h-4 w-4" />
            </div>
            <span className="min-w-0 flex-1 text-sm font-medium">Notificaciones</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={() => navigate("/privacidad")}
            className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3.5 text-left shadow-card transition-colors hover:bg-muted/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-primary-dark">
              <Shield className="h-4 w-4" />
            </div>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Privacidad</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Recopilación y uso de datos</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </div>
      </div>
    </>
  );
}
