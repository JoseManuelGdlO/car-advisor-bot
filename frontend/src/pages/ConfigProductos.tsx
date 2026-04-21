import { useState, useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { CarStatus } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { crmApi } from "@/services/crm";

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
  const { data } = useQuery({ queryKey: ["vehicles"], queryFn: () => crmApi.getVehicles(token!), enabled: Boolean(token) });
  const cars = (data || []) as any[];
  const [filter, setFilter] = useState<"all" | CarStatus>("all");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    return cars.filter((c) => {
      const okF = filter === "all" || c.status === filter;
      const okQ = !q || `${c.brand} ${c.model}`.toLowerCase().includes(q.toLowerCase());
      return okF && okQ;
    });
  }, [filter, q]);

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
              <div className="mt-2">
                <StatusBadge status={c.status} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
