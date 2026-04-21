import { useState } from "react";
import { Plus, Tag, Calendar, Pencil } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { crmApi } from "@/services/crm";

export default function ConfigPromos() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["promotions"], queryFn: () => crmApi.getPromotions(token!), enabled: Boolean(token) });
  const [items, setItems] = useState<any[]>([]);
  const source = items.length ? items : (data as any[]);

  const toggle = (id: string) =>
    setItems((arr) => {
      const base = arr.length ? arr : (data as any[]);
      return base.map((p) => (p.id === id ? { ...p, active: !p.active } : p));
    });

  const persistToggle = async (id: string) => {
    toggle(id);
    if (token) {
      await crmApi.togglePromotion(token, id);
      await queryClient.invalidateQueries({ queryKey: ["promotions"] });
    }
  };

  return (
    <>
      <ScreenHeader
        title="Promociones"
        subtitle={`${source.filter((p) => p.active).length} activas`}
        back
        action={
          <Button size="sm" className="rounded-full h-9 px-3 shadow-green">
            <Plus className="w-4 h-4" /> Promo
          </Button>
        }
      />

      <ul className="px-4 py-4 space-y-3">
        {source.map((p) => (
          <li
            key={p.id}
            className={cn(
              "bg-card rounded-2xl shadow-card border overflow-hidden transition-opacity",
              p.active ? "border-border" : "border-border opacity-60"
            )}
          >
            <div className={cn("h-1.5", p.active ? "bg-gradient-primary" : "bg-muted")} />
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl grid place-items-center shrink-0",
                  p.active ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"
                )}>
                  <Tag className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-sm">{p.title}</p>
                    <button
                      onClick={() => persistToggle(p.id)}
                      role="switch"
                      aria-checked={p.active}
                      className={cn(
                        "shrink-0 w-10 h-6 rounded-full relative transition-colors",
                        p.active ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-soft transition-all",
                          p.active ? "left-[18px]" : "left-0.5"
                        )}
                      />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{p.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Hasta {p.validUntil}
                    </span>
                  </div>
                  <p className="text-[11px] text-primary-dark font-semibold mt-1.5">{p.appliesTo}</p>
                </div>
              </div>
              <div className="flex justify-end mt-2">
                <button className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1">
                  <Pencil className="w-3 h-3" /> Editar
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
