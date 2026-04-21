import { useState, useMemo } from "react";
import { Check, Plus, Search } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { CarStatus } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { crmApi, FinancingPlanDto, VehicleDto } from "@/services/crm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

const filters: { key: "all" | CarStatus; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "available", label: "Disponibles" },
  { key: "reserved", label: "Apartados" },
  { key: "sold", label: "Vendidos" },
];

const formatPrice = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

export default function ConfigProductos() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["vehicles"], queryFn: () => crmApi.getVehicles(token!), enabled: Boolean(token) });
  const { data: plansData = [] } = useQuery({
    queryKey: ["financing-plans"],
    queryFn: () => crmApi.getFinancingPlans(token!),
    enabled: Boolean(token),
  });
  const cars = (data || []) as VehicleDto[];
  const plans = plansData as FinancingPlanDto[];
  const [filter, setFilter] = useState<"all" | CarStatus>("all");
  const [q, setQ] = useState("");
  const [updating, setUpdating] = useState<string>("");

  const list = useMemo(() => {
    return cars.filter((c) => {
      const okF = filter === "all" || c.status === filter;
      const okQ = !q || `${c.brand} ${c.model}`.toLowerCase().includes(q.toLowerCase());
      return okF && okQ;
    });
  }, [filter, q]);

  const togglePlanForVehicle = async (vehicleId: string, planId: string, selected: boolean) => {
    if (!token) return;
    setUpdating(`${vehicleId}-${planId}`);
    if (selected) {
      await crmApi.removePlanFromVehicle(token, vehicleId, planId);
    } else {
      await crmApi.assignPlanToVehicle(token, vehicleId, planId);
    }
    await queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    await queryClient.invalidateQueries({ queryKey: ["financing-plans"] });
    setUpdating("");
  };

  return (
    <>
      <ScreenHeader
        title="Productos"
        subtitle={`${cars.length} autos en catálogo`}
        back
        action={
          <Button size="sm" className="rounded-full h-9 px-3 shadow-green">
            <Plus className="w-4 h-4" /> Auto
          </Button>
        }
      />

      <div className="px-4 py-3 space-y-3 sticky top-[65px] bg-background/95 backdrop-blur z-10 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar marca o modelo…"
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3.5 h-8 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border",
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 grid grid-cols-2 gap-3">
        {list.map((c) => (
          <div key={c.id} className="bg-card rounded-2xl shadow-card border border-border overflow-hidden">
            <div className="aspect-[4/3] bg-gradient-soft grid place-items-center text-5xl">
              {c.image}
            </div>
            <div className="p-3">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">{c.brand}</p>
              <p className="font-bold text-sm leading-tight">{c.model}</p>
              <p className="text-xs text-muted-foreground">{c.year} · {c.km.toLocaleString("es-MX")} km</p>
              <p className="font-extrabold text-primary-dark text-sm mt-1.5">{formatPrice(c.price)}</p>
              {c.financingPlans?.length ? (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {c.financingPlans[0].showRate
                    ? `Financiamiento desde ${Number(c.financingPlans[0].rate).toFixed(2)}%`
                    : "Financiamiento disponible"}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1">Sin plan asignado</p>
              )}
              <div className="mt-2">
                <StatusBadge status={c.status} />
              </div>
              <div className="mt-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 px-2 rounded-lg text-[11px]">
                      Asignar financiamiento
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Asignar planes</DialogTitle>
                      <DialogDescription>
                        {c.brand} {c.model} {c.year}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[320px] overflow-auto">
                      {plans.map((plan) => {
                        const selected = Boolean(c.financingPlans?.some((x) => x.id === plan.id));
                        const key = `${c.id}-${plan.id}`;
                        return (
                          <label key={plan.id} className="flex items-start gap-2 rounded-lg border border-border p-2">
                            <Checkbox
                              checked={selected}
                              disabled={updating === key}
                              onCheckedChange={() => togglePlanForVehicle(c.id, plan.id, selected)}
                            />
                            <span className="text-xs">
                              <span className="font-semibold">{plan.name}</span> · {plan.lender} ·{" "}
                              {plan.showRate ? `${Number(plan.rate).toFixed(2)}%` : "Tasa oculta"}
                            </span>
                            {updating === key ? <Check className="w-3.5 h-3.5 ml-auto text-success" /> : null}
                          </label>
                        );
                      })}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
