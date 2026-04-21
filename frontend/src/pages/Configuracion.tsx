import { useNavigate } from "react-router-dom";
import { HelpCircle, Car, Tag, ChevronRight, Bot, Zap, Landmark, Clock3 } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { crmApi } from "@/services/crm";
import { Switch } from "@/components/ui/switch";

const sections = [
  {
    to: "/config/faqs",
    icon: HelpCircle,
    title: "Preguntas frecuentes",
    desc: "Respuestas automáticas del bot",
    color: "bg-info/10 text-info",
    countLabel: (n: number) => `${n} preguntas`,
  },
  {
    to: "/config/productos",
    icon: Car,
    title: "Productos (autos)",
    desc: "Catálogo, precios y especificaciones",
    color: "bg-primary/10 text-primary-dark",
    countLabel: (n: number) => `${n} autos en catálogo`,
  },
  {
    to: "/config/financiamiento",
    icon: Landmark,
    title: "Financiamiento",
    desc: "Planes, tasas y requisitos",
    color: "bg-success/10 text-success",
    countLabel: (n: number) => `${n} planes`,
  },
  {
    to: "/config/bot",
    icon: Clock3,
    title: "Horario del bot",
    desc: "Disponibilidad y zona horaria",
    color: "bg-secondary text-secondary-foreground",
    countLabel: () => "Configura horarios por día",
  },
  {
    to: "/config/promociones",
    icon: Tag,
    title: "Promociones",
    desc: "Ofertas y descuentos activos",
    color: "bg-warning/10 text-warning",
    countLabel: (n: number) => `${n} promos activas`,
  },
];

export default function Configuracion() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data: faqs = [] } = useQuery({ queryKey: ["faqs"], queryFn: () => crmApi.getFaqs(token!), enabled: Boolean(token) });
  const { data: cars = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => crmApi.getVehicles(token!), enabled: Boolean(token) });
  const { data: promos = [] } = useQuery({ queryKey: ["promotions"], queryFn: () => crmApi.getPromotions(token!), enabled: Boolean(token) });
  const { data: botSettings } = useQuery({ queryKey: ["bot-settings"], queryFn: () => crmApi.getBotSettings(token!), enabled: Boolean(token) });
  const botEnabled = botSettings?.isEnabled ?? true;
  const toggleBotMutation = useMutation({
    mutationFn: async (nextEnabled: boolean) => crmApi.updateBotSettings(token!, { isEnabled: nextEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bot-settings"] });
    },
  });
  const { data: financingPlans = [] } = useQuery({
    queryKey: ["financing-plans"],
    queryFn: () => crmApi.getFinancingPlans(token!),
    enabled: Boolean(token),
  });
  const counts = [faqs.length, cars.length, financingPlans.length, 0, promos.filter((p: any) => p.active).length];

  return (
    <>
      <ScreenHeader title="Configuración" subtitle="Personaliza tu chatbot" variant="primary" />

      <div className="px-4 py-5 space-y-5">
        {/* Bot status */}
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

        {/* Sections */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
            Contenido del bot
          </h2>
          {sections.map((s, i) => (
            <button
              key={s.to}
              onClick={() => navigate(s.to)}
              className="w-full bg-card rounded-2xl p-4 shadow-card border border-border flex items-center gap-3 text-left hover:bg-muted/40 transition-colors"
            >
              <div className={`w-12 h-12 rounded-2xl grid place-items-center ${s.color}`}>
                <s.icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
                <p className="text-[11px] text-primary-dark font-semibold mt-0.5">{s.countLabel(counts[i])}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>

        {/* AI tip */}
        <div className="rounded-2xl p-4 bg-gradient-primary text-primary-foreground shadow-green flex items-start gap-3">
          <Zap className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold">Consejo</p>
            <p className="text-xs opacity-90 mt-0.5">
              Mantén tus FAQs y catálogo al día — el bot vende mejor con info actualizada.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
