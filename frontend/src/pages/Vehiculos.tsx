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
    <div className="flex h-full min-h-0 flex-col">
      <ScreenHeader title="Vehículos" subtitle="Catálogo, financiamiento y promociones" variant="primary" />

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-2 pt-3">
        {sections.map((s, i) => {
          const Icon = s.icon;
          return (
            <button
              key={s.to}
              type="button"
              onClick={() => navigate(s.to)}
              className={`flex w-full flex-1 flex-col rounded-2xl p-3 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${s.shell}`}
            >
              <div className="flex shrink-0 items-center gap-2 px-0.5">
                <div className={`grid h-9 w-9 place-items-center rounded-xl ${s.chip}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className={`text-sm font-semibold ${s.accent}`}>{s.kicker}</span>
                <ChevronRight className={`ml-auto h-4 w-4 shrink-0 opacity-70 ${s.accent}`} />
              </div>

              <div className="mt-3 shrink-0 rounded-2xl bg-card px-4 py-3.5 shadow-card">
                <p className="text-sm font-bold leading-snug text-foreground">{s.title}</p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{s.desc}</p>
              </div>

              <div className="mt-auto shrink-0 px-1 pb-0.5 pt-3">
                <p className="text-2xl font-bold leading-none text-foreground tabular-nums">{counts[i]}</p>
                <p className={`mt-1 text-xs ${s.accent}`}>{s.metric}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
