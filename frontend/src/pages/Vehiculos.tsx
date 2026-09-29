import { useNavigate } from "react-router-dom";
import { Car, ChevronRight, Landmark, Tag } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { crmApi, type FinancingPlanDto, type VehicleDto } from "@/services/crm";

type PromotionDto = {
  active?: boolean;
};

const sections = [
  {
    to: "/vehiculos/productos",
    icon: Car,
    kicker: "Catálogo",
    title: "Productos (autos)",
    desc: "Catálogo, precios y especificaciones",
    metric: "autos en catálogo",
    shell: "bg-accent",
    chip: "bg-primary/10 text-primary-dark",
    accent: "text-primary-dark",
  },
  {
    to: "/vehiculos/financiamiento",
    icon: Landmark,
    kicker: "Planes",
    title: "Financiamiento",
    desc: "Planes, tasas y requisitos",
    metric: "planes",
    shell: "bg-primary/15",
    chip: "bg-primary/10 text-primary-dark",
    accent: "text-primary-dark",
  },
  {
    to: "/vehiculos/promociones",
    icon: Tag,
    kicker: "Ofertas",
    title: "Promociones",
    desc: "Ofertas y descuentos activos",
    metric: "promos activas",
    shell: "bg-warning/15",
    chip: "bg-warning/15 text-warning",
    accent: "text-warning",
  },
];

export default function Vehiculos() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { data: cars = [] } = useQuery<VehicleDto[]>({
    queryKey: ["vehicles"],
    queryFn: () => crmApi.getVehicles(token!) as Promise<VehicleDto[]>,
    enabled: Boolean(token),
  });
  const { data: promos = [] } = useQuery<PromotionDto[]>({
    queryKey: ["promotions"],
    queryFn: () => crmApi.getPromotions(token!) as Promise<PromotionDto[]>,
    enabled: Boolean(token),
  });
  const { data: financingPlans = [] } = useQuery<FinancingPlanDto[]>({
    queryKey: ["financing-plans"],
    queryFn: () => crmApi.getFinancingPlans(token!) as Promise<FinancingPlanDto[]>,
    enabled: Boolean(token),
  });
  const activePromos = promos.filter((p) => p.active).length;
  const counts = [cars.length, financingPlans.length, activePromos];

  return (
    <div className="h-full min-h-0 flex flex-col">
      <ScreenHeader title="Vehículos" subtitle="Catálogo, financiamiento y promociones" variant="primary" />

      <div className="flex-1 min-h-0 grid grid-rows-3 gap-3 px-4 py-4">
        {sections.map((s, i) => (
          <button
            key={s.to}
            type="button"
            onClick={() => navigate(s.to)}
            className={`h-full min-h-0 w-full rounded-2xl ${s.shell} p-3 text-left flex flex-col gap-3 active:scale-[0.99] transition-transform`}
          >
            <div className="flex items-center gap-2 px-0.5">
              <div className={`w-9 h-9 rounded-xl grid place-items-center ${s.chip}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <span className={`text-sm font-semibold ${s.accent}`}>{s.kicker}</span>
              <ChevronRight className={`w-4 h-4 ml-auto shrink-0 ${s.accent} opacity-70`} />
            </div>

            <div className="flex-1 min-h-0 bg-card rounded-2xl px-4 py-3.5 shadow-card flex flex-col">
              <p className="text-sm font-bold text-foreground leading-snug">{s.title}</p>
              <div className="my-2.5 h-px bg-border" />
              <p className="text-xs text-muted-foreground leading-snug">{s.desc}</p>
            </div>

            <div className="px-1 pb-0.5">
              <p className="text-2xl font-bold text-foreground leading-none">{counts[i]}</p>
              <p className={`text-xs mt-1 ${s.accent}`}>{s.metric}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
