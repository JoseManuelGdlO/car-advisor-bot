import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Car, Check, Pencil, Plus, Search, Tag, Trash2 } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { CarStatus } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { crmApi, FinancingPlanDto, PromotionDto, VehicleDto } from "@/services/crm";
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
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { normalizeApiError } from "@/lib/formErrors";

const filters: { key: "all" | CarStatus; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "available", label: "Disponibles" },
  { key: "reserved", label: "Apartados" },
  { key: "sold", label: "Vendidos" },
];

const formatPrice = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Math.round(n));

const parsePriceInt = (raw: string) => Math.round(Number(raw));
const mediaBase = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api").replace(/\/api\/?$/, "");
const toMediaUrl = (value: string) => (value.startsWith("http") ? value : `${mediaBase}${value}`);
const vehicleEmojis = ["🚗", "🚙", "🚘", "🚕", "🚖", "🚐", "🚚", "🚛", "🛻", "🚜", "🏎️", "🚓", "🚑", "🚒", "🚌"];

const parseMetadataInput = (raw: string): Record<string, string | number | boolean> => {
  const text = raw.trim();
  if (!text) return {};

  // Compatibilidad con usuarios avanzados que prefieren JSON.
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, string | number | boolean>;
      }
    } catch {
      return {};
    }
    return {};
  }

  const result: Record<string, string | number | boolean> = {};
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const separatorIndex = line.search(/[:=]/);
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (!key || !rawValue) continue;

    const lowerValue = rawValue.toLowerCase();
    if (["true", "si", "sí", "yes"].includes(lowerValue)) {
      result[key] = true;
      continue;
    }
    if (["false", "no"].includes(lowerValue)) {
      result[key] = false;
      continue;
    }
    const numberValue = Number(rawValue);
    result[key] = Number.isNaN(numberValue) ? rawValue : numberValue;
  }
  return result;
};

export default function ConfigProductos() {
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["vehicles"], queryFn: () => crmApi.getVehicles(token!), enabled: Boolean(token) });
  const { data: plansData = [] } = useQuery({
    queryKey: ["financing-plans"],
    queryFn: () => crmApi.getFinancingPlans(token!),
    enabled: Boolean(token),
  });
  const { data: promotionsData = [] } = useQuery({
    queryKey: ["promotions"],
    queryFn: () => crmApi.getPromotions(token!) as Promise<PromotionDto[]>,
    enabled: Boolean(token),
  });
  const cars = (data || []) as VehicleDto[];
  const plans = plansData as FinancingPlanDto[];
  const promotions = promotionsData as PromotionDto[];
  const [filter, setFilter] = useState<"all" | CarStatus>("all");
  const [q, setQ] = useState("");
  const [updating, setUpdating] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [vehicleFormError, setVehicleFormError] = useState("");
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
  const focusedVehicleId = searchParams.get("vehicleId");

  const list = useMemo(() => {
    return cars.filter((c) => {
      const okF = filter === "all" || c.status === filter;
      const okQ = !q || `${c.brand} ${c.model}`.toLowerCase().includes(q.toLowerCase());
      return okF && okQ;
    });
  }, [cars, filter, q]);

  useEffect(() => {
    if (!focusedVehicleId) return;
    const element = document.getElementById(`vehicle-${focusedVehicleId}`);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedVehicleId, list.length]);

  const togglePlanForVehicle = async (vehicleId: string, planId: string, selected: boolean) => {
    if (!token) return;
    setUpdating(`fp:${vehicleId}:${planId}`);
    if (selected) {
      await crmApi.removePlanFromVehicle(token, vehicleId, planId);
    } else {
      await crmApi.assignPlanToVehicle(token, vehicleId, planId);
    }
    await queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    await queryClient.invalidateQueries({ queryKey: ["financing-plans"] });
    setUpdating("");
  };

  const togglePromotionForVehicle = async (vehicleId: string, promo: PromotionDto, selected: boolean) => {
    if (!token) return;
    const prev = Array.isArray(promo.vehicleIds) ? promo.vehicleIds.map(String) : [];
    const nextSet = new Set(prev);
    if (selected) {
      nextSet.delete(String(vehicleId));
    } else {
      nextSet.add(String(vehicleId));
    }
    const nextIds = Array.from(nextSet);
    setUpdating(`pr:${vehicleId}:${promo.id}`);
    await crmApi.updatePromotion(token, promo.id, {
      title: promo.title,
      description: promo.description,
      validUntil: promo.validUntil ?? "",
      appliesTo: promo.appliesTo ?? "",
      active: promo.active,
      vehicleIds: nextIds,
    });
    await queryClient.invalidateQueries({ queryKey: ["promotions"] });
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
      price: String(Math.round(Number(car.price ?? 0))),
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
    setVehicleFormError("");
    try {
      const uploaded = selectedFiles.length > 0 ? (await crmApi.uploadVehicleImages(token, selectedFiles)).imageUrls : [];
      const payload = {
        brand: form.brand.trim(),
        model: form.model.trim(),
        year: Number(form.year),
        price: parsePriceInt(form.price),
        km: Number(form.km || "0"),
        transmission: form.transmission.trim(),
        engine: form.engine.trim(),
        color: form.color.trim(),
        status: form.status,
        description: form.description.trim(),
        image: form.image.trim() || "🚗",
        imageUrls: [...imageUrls, ...uploaded],
        metadata: parseMetadataInput(form.metadataText),
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
    } catch (err) {
      setVehicleFormError(normalizeApiError(err, "No se pudo guardar el vehículo.").formError);
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
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) setVehicleFormError("");
            }}
          >
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
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Marca</span>
                    <Input placeholder="Ej. Volkswagen" value={form.brand} onChange={(e) => setForm((s) => ({ ...s, brand: e.target.value }))} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Modelo</span>
                    <Input placeholder="Ej. Tiguan Trendline" value={form.model} onChange={(e) => setForm((s) => ({ ...s, model: e.target.value }))} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Año</span>
                    <Input
                      type="number"
                      placeholder="Ej. 2022"
                      value={form.year}
                      onChange={(e) => setForm((s) => ({ ...s, year: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Precio</span>
                    <Input
                      type="number"
                      step={1}
                      min={0}
                      placeholder="Ej. 629900"
                      value={form.price}
                      onChange={(e) => setForm((s) => ({ ...s, price: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Kilometraje</span>
                    <Input
                      type="number"
                      placeholder="Ej. 22000"
                      value={form.km}
                      onChange={(e) => setForm((s) => ({ ...s, km: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Color</span>
                    <Input placeholder="Ej. Gris" value={form.color} onChange={(e) => setForm((s) => ({ ...s, color: e.target.value }))} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Transmisión</span>
                    <Input
                      placeholder="Ej. DSG"
                      value={form.transmission}
                      onChange={(e) => setForm((s) => ({ ...s, transmission: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Motor</span>
                    <Input placeholder="Ej. 1.4L Turbo" value={form.engine} onChange={(e) => setForm((s) => ({ ...s, engine: e.target.value }))} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Emoji del vehículo</span>
                    <select
                      value={form.image}
                      onChange={(e) => setForm((s) => ({ ...s, image: e.target.value }))}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm w-full"
                    >
                      {!vehicleEmojis.includes(form.image) ? (
                        <option value={form.image}>{form.image || "🚗"}</option>
                      ) : null}
                      {vehicleEmojis.map((emoji) => (
                        <option key={emoji} value={emoji}>
                          {emoji}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Prioridad de envío</span>
                    <Input
                      type="number"
                      placeholder="Ej. 10"
                      value={form.outboundPriority}
                      onChange={(e) => setForm((s) => ({ ...s, outboundPriority: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="space-y-1 block">
                  <span className="text-xs font-semibold text-muted-foreground">Estatus</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as CarStatus }))}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm w-full"
                  >
                    <option value="available">Disponible</option>
                    <option value="reserved">Apartado</option>
                    <option value="sold">Vendido</option>
                  </select>
                </label>
                <label className="space-y-1 block">
                  <span className="text-xs font-semibold text-muted-foreground">Imágenes</span>
                  <Input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
                  />
                </label>
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
                <label className="space-y-1 block">
                  <span className="text-xs font-semibold text-muted-foreground">Datos adicionales (opcional)</span>
                  <Textarea
                    placeholder={`Ejemplos:
Dueño: Agencia
Versión: Highline`}
                    value={form.metadataText}
                    onChange={(e) => setForm((s) => ({ ...s, metadataText: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Escribe un dato por renglón usando "Clave: valor". Si prefieres, también puedes pegar JSON.
                  </p>
                </label>
                <label className="space-y-1 block">
                  <span className="text-xs font-semibold text-muted-foreground">Descripción (opcional)</span>
                  <Textarea
                    placeholder="Agrega detalles del vehículo"
                    value={form.description}
                    onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                  />
                </label>
                <Button
                  onClick={saveVehicle}
                  className="w-full"
                  disabled={
                    creating || !form.brand || !form.model || !form.year || !form.price || !form.transmission || !form.engine || !form.color
                  }
                >
                  {creating ? "Guardando..." : editingId ? "Guardar cambios" : "Crear nuevo auto"}
                </Button>
                <FormErrorAlert title="No se pudo guardar el vehículo" message={vehicleFormError} />
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
        {list.map((c) => {
          const linkedPromoCount = promotions.filter(
            (p) => Array.isArray(p.vehicleIds) && p.vehicleIds.some((id) => String(id) === String(c.id))
          ).length;
          return (
            <div
              id={`vehicle-${c.id}`}
              key={c.id}
              className={cn(
                "group bg-card rounded-2xl shadow-card border border-border overflow-hidden transition-shadow duration-200 hover:shadow-elevated",
                focusedVehicleId === c.id ? "ring-2 ring-primary/60" : ""
              )}
            >
              <div className="relative aspect-[4/3] bg-muted/80 overflow-hidden rounded-t-2xl">
                {c.imageUrls?.[0] ? (
                  <img
                    src={toMediaUrl(c.imageUrls[0])}
                    alt={`${c.brand} ${c.model}`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-soft">
                    <span className="text-4xl leading-none select-none" aria-hidden>
                      {c.image || "🚗"}
                    </span>
                    <Car className="w-5 h-5 text-muted-foreground/50" aria-hidden />
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/25 to-transparent" />
                <div className="absolute bottom-2 right-2 pointer-events-none">
                  <StatusBadge status={c.status} />
                </div>
              </div>
              <div className="p-3 space-y-2">
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide leading-none">{c.brand}</p>
                  <p className="font-bold text-sm leading-snug line-clamp-2">{c.model}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.year} · {c.km.toLocaleString("es-MX")} km
                  </p>
                </div>
                <p className="font-extrabold text-primary-dark text-base tabular-nums tracking-tight">{formatPrice(c.price)}</p>
                <div className="space-y-1 text-[11px] text-muted-foreground leading-snug">
                  <p>Prioridad envío: {c.outboundPriority ?? 0}</p>
                  {c.financingPlans?.length ? (
                    <p>
                      {c.financingPlans[0].showRate
                        ? `Financiamiento desde ${Number(c.financingPlans[0].rate).toFixed(2)}%`
                        : "Financiamiento disponible"}
                    </p>
                  ) : (
                    <p>Sin plan asignado</p>
                  )}
                  <p>
                    {linkedPromoCount === 0
                      ? "Sin promos vinculadas"
                      : linkedPromoCount === 1
                        ? "1 promo vinculada"
                        : `${linkedPromoCount} promos vinculadas`}
                  </p>
                </div>
                <div className="border-t border-border/60 pt-2.5 mt-1 grid grid-cols-2 gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-1.5 rounded-lg text-[11px] leading-tight"
                    onClick={() => startEditVehicle(c)}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-0.5 shrink-0" /> Editar
                  </Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-1.5 rounded-lg text-[11px] leading-tight"
                        title="Asignar promoción"
                      >
                        <Tag className="w-3.5 h-3.5 mr-0.5 shrink-0" />
                        <span className="line-clamp-2 text-left">Promoción</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Asignar promociones</DialogTitle>
                        <DialogDescription>
                          {c.brand} {c.model} {c.year}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-2 max-h-[320px] overflow-auto">
                        {promotions.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">No hay promociones en el catálogo. Créalas en Vehículos → Promociones.</p>
                        ) : (
                          promotions.map((promo) => {
                            const ids = Array.isArray(promo.vehicleIds) ? promo.vehicleIds.map(String) : [];
                            const selected = ids.includes(String(c.id));
                            const key = `pr:${c.id}:${promo.id}`;
                            return (
                              <label key={promo.id} className="flex items-start gap-2 rounded-lg border border-border p-2">
                                <Checkbox
                                  checked={selected}
                                  disabled={updating === key}
                                  onCheckedChange={() => togglePromotionForVehicle(c.id, promo, selected)}
                                />
                                <span className="text-xs min-w-0">
                                  <span className="font-semibold block">{promo.title}</span>
                                  {promo.active ? null : (
                                    <span className="text-[10px] text-muted-foreground">(inactiva)</span>
                                  )}
                                </span>
                                {updating === key ? <Check className="w-3.5 h-3.5 ml-auto shrink-0 text-success" /> : null}
                              </label>
                            );
                          })
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-8 px-2 rounded-lg text-[11px] col-span-2 w-full">
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
                          const key = `fp:${c.id}:${plan.id}`;
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
          );
        })}
      </div>
    </>
  );
}
