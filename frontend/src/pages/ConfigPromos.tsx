import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Tag, Calendar, Pencil, Trash2 } from "lucide-react";
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
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { normalizeApiError } from "@/lib/formErrors";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toDateInputValue = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  if (ISO_DATE_RE.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
};

const formatValidUntilLabel = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return "Sin fecha";
  const iso = toDateInputValue(trimmed);
  if (iso) {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return trimmed;
};

const DATE_INPUT_CLASS =
  "h-8 w-[10.5rem] max-w-full border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70";

export default function ConfigPromos() {
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["promotions"], queryFn: () => crmApi.getPromotions(token!), enabled: Boolean(token) });
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => crmApi.getVehicles(token!), enabled: Boolean(token) });
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingPromo, setDeletingPromo] = useState<any | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    validUntil: "",
    appliesTo: "",
    vehicleIds: [] as string[],
  });
  const source = items.length ? items : (data as any[]);
  const focusedPromotionId = searchParams.get("promotionId");

  useEffect(() => {
    if (!focusedPromotionId) return;
    const element = document.getElementById(`promotion-${focusedPromotionId}`);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedPromotionId, source.length]);

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
      validUntil: toDateInputValue(promo.validUntil),
      appliesTo: promo.appliesTo || "",
      vehicleIds: Array.isArray(promo.vehicleIds) ? promo.vehicleIds : [],
    });
    setOpen(true);
  };

  const openDeletePromotion = (promo: any) => {
    setDeletingPromo(promo);
    setDeleteOpen(true);
  };

  const onDeletePromotion = async () => {
    if (!token || !deletingPromo) return;
    setSaving(true);
    setDeleteError("");
    try {
      await crmApi.deletePromotion(token, deletingPromo.id);
      await queryClient.invalidateQueries({ queryKey: ["promotions"] });
      setItems((arr) => arr.filter((p) => p.id !== deletingPromo.id));
      setDeleteOpen(false);
      setDeletingPromo(null);
      if (editingId === deletingPromo.id) {
        setOpen(false);
        setEditingId(null);
        setForm({ title: "", description: "", validUntil: "", appliesTo: "", vehicleIds: [] });
      }
    } catch (err) {
      setDeleteError(normalizeApiError(err, "No se pudo eliminar la promoción.").formError);
    } finally {
      setSaving(false);
    }
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
                <div className="flex items-center justify-between gap-3">
                  <label className="shrink-0 pl-3 text-sm font-semibold text-muted-foreground" htmlFor="promo-valid-until">
                    Válida hasta:
                  </label>
                  <div className="inline-flex h-10 w-fit max-w-full shrink-0 items-center gap-2 rounded-md border border-input bg-background px-3 ring-offset-background has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2">
                    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <Input
                      id="promo-valid-until"
                      type="date"
                      className={DATE_INPUT_CLASS}
                      value={form.validUntil}
                      onChange={(e) => setForm((s) => ({ ...s, validUntil: e.target.value }))}
                    />
                  </div>
                </div>
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
            id={`promotion-${p.id}`}
            key={p.id}
            className={cn(
              "bg-card rounded-2xl shadow-card border overflow-hidden transition-opacity",
              p.active ? "border-border" : "border-border opacity-60",
              focusedPromotionId === p.id ? "ring-2 ring-primary/60" : ""
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
                      <Calendar className="w-3 h-3" /> Hasta {formatValidUntilLabel(p.validUntil)}
                    </span>
                  </div>
                  <p className="text-[11px] text-primary-dark font-semibold mt-1.5">{p.appliesTo}</p>
                  {p.vehicleIds?.length ? (
                    <p className="text-[11px] text-muted-foreground mt-1">Vehículos vinculados: {p.vehicleIds.length}</p>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-end gap-1">
                <button
                  className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  onClick={() => startEditPromotion(p)}
                >
                  <Pencil className="h-3 w-3" /> Editar
                </button>
                <button
                  className="p-2 text-destructive hover:text-destructive/80"
                  aria-label="Eliminar promoción"
                  onClick={() => openDeletePromotion(p)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Dialog
        open={deleteOpen}
        onOpenChange={(next) => {
          setDeleteOpen(next);
          if (!next) setDeleteError("");
        }}
      >
        <DialogContent className="max-w-md overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Eliminar promoción</DialogTitle>
            <DialogDescription>Esta acción no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="break-words text-sm font-semibold text-foreground">{deletingPromo?.title}</p>
            {deletingPromo?.description ? (
              <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{deletingPromo.description}</p>
            ) : null}
            <div className="flex gap-2">
              <Button variant="outline" className="w-full" onClick={() => setDeleteOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="destructive" className="w-full" disabled={saving} onClick={onDeletePromotion}>
                {saving ? "Eliminando..." : "Si, estoy seguro"}
              </Button>
            </div>
            <FormErrorAlert title="No se pudo eliminar la promoción" message={deleteError} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
