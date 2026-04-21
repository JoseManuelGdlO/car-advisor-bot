import { useState, useMemo } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const filters: { key: "all" | CarStatus; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "available", label: "Disponibles" },
  { key: "reserved", label: "Apartados" },
  { key: "sold", label: "Vendidos" },
];

const formatPrice = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
const mediaBase = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api").replace(/\/api\/?$/, "");
const toMediaUrl = (value: string) => (value.startsWith("http") ? value : `${mediaBase}${value}`);

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
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [form, setForm] = useState({
    brand: "",
    model: "",
    year: "",
    price: "",
    km: "0",
    transmission: "",
    engine: "",
    color: "",
    status: "available" as CarStatus,
    description: "",
    image: "🚗",
    metadataText: "",
    outboundPriority: "0",
  });

  const list = useMemo(() => {
    return cars.filter((c) => {
      const okF = filter === "all" || c.status === filter;
      const okQ = !q || `${c.brand} ${c.model}`.toLowerCase().includes(q.toLowerCase());
      return okF && okQ;
    });
  }, [cars, filter, q]);

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

  const startEditVehicle = (car: VehicleDto) => {
    setEditingId(car.id);
    setSelectedFiles([]);
    setImageUrls(car.imageUrls || []);
    setForm({
      brand: car.brand || "",
      model: car.model || "",
      year: String(car.year || ""),
      price: String(car.price || ""),
      km: String(car.km || 0),
      transmission: car.transmission || "",
      engine: car.engine || "",
      color: car.color || "",
      status: car.status || "available",
      description: car.description || "",
      image: car.image || "🚗",
      metadataText: car.metadata ? JSON.stringify(car.metadata, null, 2) : "",
      outboundPriority: String(car.outboundPriority ?? 0),
    });
    setCreateOpen(true);
  };

  const saveVehicle = async () => {
    if (!token) return;
    if (!form.brand || !form.model || !form.year || !form.price || !form.transmission || !form.engine || !form.color) return;
    setCreating(true);
    try {
      const uploaded = selectedFiles.length > 0 ? (await crmApi.uploadVehicleImages(token, selectedFiles)).imageUrls : [];
      const payload = {
        brand: form.brand.trim(),
        model: form.model.trim(),
        year: Number(form.year),
        price: Number(form.price),
        km: Number(form.km || "0"),
        transmission: form.transmission.trim(),
        engine: form.engine.trim(),
        color: form.color.trim(),
        status: form.status,
        description: form.description.trim(),
        image: form.image.trim() || "🚗",
        imageUrls: [...imageUrls, ...uploaded],
        metadata: (() => {
          if (!form.metadataText.trim()) return {};
          try {
            return JSON.parse(form.metadataText);
          } catch {
            return {};
          }
        })(),
        outboundPriority: Number(form.outboundPriority || "0"),
      };
      if (editingId) {
        await crmApi.updateVehicle(token, editingId, payload);
      } else {
        await crmApi.createVehicle(token, payload);
      }
      await queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setCreateOpen(false);
      setEditingId(null);
      setSelectedFiles([]);
      setImageUrls([]);
      setForm({
        brand: "",
        model: "",
        year: "",
        price: "",
        km: "0",
        transmission: "",
        engine: "",
        color: "",
        status: "available",
        description: "",
        image: "🚗",
        metadataText: "",
        outboundPriority: "0",
      });
    } finally {
      setCreating(false);
    }
  };

  const moveImage = (index: number, direction: "up" | "down") => {
    setImageUrls((current) => {
      const next = [...current];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeImage = (index: number) => {
    setImageUrls((current) => current.filter((_, i) => i !== index));
  };

  return (
    <>
      <ScreenHeader
        title="Productos"
        subtitle={`${cars.length} autos en catálogo`}
        back
        action={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-full h-9 px-3 shadow-green"
                onClick={() => {
                  setEditingId(null);
                  setSelectedFiles([]);
                  setImageUrls([]);
                  setForm({
                    brand: "",
                    model: "",
                    year: "",
                    price: "",
                    km: "0",
                    transmission: "",
                    engine: "",
                    color: "",
                    status: "available",
                    description: "",
                    image: "🚗",
                    metadataText: "",
                    outboundPriority: "0",
                  });
                }}
              >
                <Plus className="w-4 h-4" /> Auto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto pr-8">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar auto" : "Nuevo auto"}</DialogTitle>
                <DialogDescription>
                  {editingId ? "Actualiza los datos del vehículo." : "Completa los datos para agregar el vehículo al catálogo."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Marca" value={form.brand} onChange={(e) => setForm((s) => ({ ...s, brand: e.target.value }))} />
                  <Input placeholder="Modelo" value={form.model} onChange={(e) => setForm((s) => ({ ...s, model: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Año"
                    value={form.year}
                    onChange={(e) => setForm((s) => ({ ...s, year: e.target.value }))}
                  />
                  <Input
                    type="number"
                    placeholder="Precio"
                    value={form.price}
                    onChange={(e) => setForm((s) => ({ ...s, price: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" placeholder="KM" value={form.km} onChange={(e) => setForm((s) => ({ ...s, km: e.target.value }))} />
                  <Input placeholder="Color" value={form.color} onChange={(e) => setForm((s) => ({ ...s, color: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Transmisión"
                    value={form.transmission}
                    onChange={(e) => setForm((s) => ({ ...s, transmission: e.target.value }))}
                  />
                  <Input placeholder="Motor" value={form.engine} onChange={(e) => setForm((s) => ({ ...s, engine: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Emoji/imagen" value={form.image} onChange={(e) => setForm((s) => ({ ...s, image: e.target.value }))} />
                  <Input
                    type="number"
                    placeholder="Prioridad envío"
                    value={form.outboundPriority}
                    onChange={(e) => setForm((s) => ({ ...s, outboundPriority: e.target.value }))}
                  />
                </div>
                <select
                  value={form.status}
                  onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as CarStatus }))}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm w-full"
                >
                  <option value="available">Disponible</option>
                  <option value="reserved">Apartado</option>
                  <option value="sold">Vendido</option>
                </select>
                <Input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
                />
                <p className="text-xs text-muted-foreground">
                  {selectedFiles.length ? `${selectedFiles.length} imagen(es) seleccionadas para subir al servidor/autobot` : "Sin imágenes seleccionadas"}
                </p>
                {imageUrls.length ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">Imágenes actuales (ordena prioridad)</p>
                    {imageUrls.map((url, index) => (
                      <div key={`${url}-${index}`} className="flex items-center gap-2 border border-border rounded-lg p-2">
                        <img src={toMediaUrl(url)} alt={`Imagen ${index + 1}`} className="w-12 h-12 rounded object-cover" />
                        <p className="text-[11px] text-muted-foreground flex-1 truncate">{url.split("/").pop()}</p>
                        <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => moveImage(index, "up")}>
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => moveImage(index, "down")}>
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button type="button" size="icon" variant="destructive" className="h-7 w-7" onClick={() => removeImage(index)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <Textarea
                  placeholder={'Metadata JSON opcional (ej: {"owner":"agencia","featured":true})'}
                  value={form.metadataText}
                  onChange={(e) => setForm((s) => ({ ...s, metadataText: e.target.value }))}
                />
                <Textarea
                  placeholder="Descripción (opcional)"
                  value={form.description}
                  onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                />
                <Button
                  onClick={saveVehicle}
                  className="w-full"
                  disabled={
                    creating || !form.brand || !form.model || !form.year || !form.price || !form.transmission || !form.engine || !form.color
                  }
                >
                  {creating ? "Guardando..." : editingId ? "Guardar cambios" : "Crear nuevo auto"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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
              {c.imageUrls?.[0] ? (
                <img src={toMediaUrl(c.imageUrls[0])} alt={`${c.brand} ${c.model}`} className="w-full h-full object-cover" />
              ) : (
                c.image
              )}
            </div>
            <div className="p-3">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">{c.brand}</p>
              <p className="font-bold text-sm leading-tight">{c.model}</p>
              <p className="text-xs text-muted-foreground">{c.year} · {c.km.toLocaleString("es-MX")} km</p>
              <p className="font-extrabold text-primary-dark text-sm mt-1.5">{formatPrice(c.price)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Prioridad envío: {c.outboundPriority ?? 0}</p>
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
                <Button size="sm" variant="outline" className="h-8 px-2 rounded-lg text-[11px]" onClick={() => startEditVehicle(c)}>
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                </Button>
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
