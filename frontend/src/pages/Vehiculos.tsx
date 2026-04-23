import { useNavigate } from "react-router-dom";
import { Car, ChevronRight, Landmark, Tag } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { crmApi } from "@/services/crm";

const sections = [
  {
    to: "/vehiculos/productos",
    icon: Car,
    title: "Productos (autos)",
    desc: "Catálogo, precios y especificaciones",
    color: "bg-primary/10 text-primary-dark",
    countLabel: (n: number) => `${n} autos en catálogo`,
  },
  {
    to: "/vehiculos/financiamiento",
    icon: Landmark,
    title: "Financiamiento",
    desc: "Planes, tasas y requisitos",
    color: "bg-success/10 text-success",
    countLabel: (n: number) => `${n} planes`,
  },
  {
    to: "/vehiculos/promociones",
    icon: Tag,
    title: "Promociones",
    desc: "Ofertas y descuentos activos",
    color: "bg-warning/10 text-warning",
    countLabel: (n: number) => `${n} promos activas`,
  },
];

export default function Vehiculos() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { data: cars = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => crmApi.getVehicles(token!), enabled: Boolean(token) });
  const { data: promos = [] } = useQuery({ queryKey: ["promotions"], queryFn: () => crmApi.getPromotions(token!), enabled: Boolean(token) });
  const { data: financingPlans = [] } = useQuery({
    queryKey: ["financing-plans"],
    queryFn: () => crmApi.getFinancingPlans(token!),
    enabled: Boolean(token),
  });
  const activePromos = promos.filter((p: { active?: boolean }) => p.active).length;
  const counts = [cars.length, financingPlans.length, activePromos];

  return (
    <>
      <ScreenHeader title="Vehículos" subtitle="Catálogo, financiamiento y promociones" variant="primary" />

      <div className="px-4 py-5 space-y-5">
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Ventas y catálogo</h2>
          {sections.map((s, i) => (
            <button
              key={s.to}
              type="button"
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
      </div>
    </>
  );
}
