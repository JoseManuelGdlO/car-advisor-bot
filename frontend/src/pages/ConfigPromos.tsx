import { useState } from "react";
import { Plus, Tag, Calendar, Pencil } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { crmApi } from "@/services/crm";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

export default function ConfigPromos() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["promotions"], queryFn: () => crmApi.getPromotions(token!), enabled: Boolean(token) });
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => crmApi.getVehicles(token!), enabled: Boolean(token) });
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    validUntil: "",
    appliesTo: "",
    vehicleIds: [] as string[],
  });
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

  const savePromotion = async () => {
    if (!token || !form.title.trim() || !form.description.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        validUntil: form.validUntil.trim(),
        appliesTo: form.appliesTo.trim(),
        vehicleIds: form.vehicleIds,
        active: true,
      };
      if (editingId) {
        await crmApi.updatePromotion(token, editingId, payload);
      } else {
        await crmApi.createPromotion(token, payload);
      }
      await queryClient.invalidateQueries({ queryKey: ["promotions"] });
      setItems([]);
      setOpen(false);
      setEditingId(null);
      setForm({ title: "", description: "", validUntil: "", appliesTo: "", vehicleIds: [] });
    } finally {
      setSaving(false);
    }
  };

  const startEditPromotion = (promo: any) => {
    setEditingId(promo.id);
    setForm({
      title: promo.title || "",
      description: promo.description || "",
      validUntil: promo.validUntil || "",
      appliesTo: promo.appliesTo || "",
      vehicleIds: Array.isArray(promo.vehicleIds) ? promo.vehicleIds : [],
    });
    setOpen(true);
  };

  return (
    <>
      <ScreenHeader
        title="Promociones"
        subtitle={`${source.filter((p) => p.active).length} activas`}
        back
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-full h-9 px-3 shadow-green"
                onClick={() => {
                  setEditingId(null);
                  setForm({ title: "", description: "", validUntil: "", appliesTo: "", vehicleIds: [] });
                }}
              >
                <Plus className="w-4 h-4" /> Promo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar promoción" : "Nueva promoción"}</DialogTitle>
                <DialogDescription>{editingId ? "Actualiza los datos de la promo." : "Crea una promo para mostrarla al cliente."}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Título" value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} />
                <Textarea
                  placeholder="Descripción"
                  value={form.description}
                  onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                />
                <Input
                  placeholder="Válida hasta (ej. 30 abril)"
                  value={form.validUntil}
                  onChange={(e) => setForm((s) => ({ ...s, validUntil: e.target.value }))}
                />
                <Input
                  placeholder="Aplica a (ej. SUVs 2022+)"
                  value={form.appliesTo}
                  onChange={(e) => setForm((s) => ({ ...s, appliesTo: e.target.value }))}
                />
                <div className="space-y-2 border border-border rounded-lg p-3 max-h-44 overflow-auto">
                  <p className="text-xs font-semibold text-muted-foreground">Vehículos incluidos en la promo</p>
                  {(vehicles as any[]).map((v) => {
                    const checked = form.vehicleIds.includes(v.id);
                    return (
                      <label key={v.id} className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() =>
                            setForm((s) => ({
                              ...s,
                              vehicleIds: checked ? s.vehicleIds.filter((id) => id !== v.id) : [...s.vehicleIds, v.id],
                            }))
                          }
                        />
                        <span>
                          {v.brand} {v.model} {v.year}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <Button className="w-full" onClick={savePromotion} disabled={saving || !form.title.trim() || !form.description.trim()}>
                  {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear promoción"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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
                  {p.vehicleIds?.length ? (
                    <p className="text-[11px] text-muted-foreground mt-1">Vehículos vinculados: {p.vehicleIds.length}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex justify-end mt-2">
                <button
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1"
                  onClick={() => startEditPromotion(p)}
                >
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
