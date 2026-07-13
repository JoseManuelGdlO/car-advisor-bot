import { useState, useMemo, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Car,
  Check,
  FileText,
  Gauge,
  ImagePlus,
  Landmark,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { normalizeApiError } from "@/lib/formErrors";

type ProductFilter = "all" | CarStatus | "noFinancing" | "noPromos";

const filters: { key: ProductFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "available", label: "Disponibles" },
  { key: "reserved", label: "Apartados" },
  { key: "sold", label: "Vendidos" },
  { key: "noFinancing", label: "Sin financiamiento" },
  { key: "noPromos", label: "Sin promos" },
];

const linkedPromoCountForVehicle = (vehicleId: string, promotions: PromotionDto[]) =>
  promotions.filter(
    (p) => Array.isArray(p.vehicleIds) && p.vehicleIds.some((id) => String(id) === String(vehicleId)),
  ).length;

const statusLabels: Record<CarStatus, string> = {
  available: "Disponible",
  reserved: "Apartado",
  sold: "Vendido",
};

type VehicleFormState = {
  brand: string;
  model: string;
  year: string;
  price: string;
  km: string;
  transmission: string;
  engine: string;
  color: string;
  status: CarStatus;
  description: string;
  image: string;
  outboundPriority: string;
};

type MetadataRow = { id: string; key: string; value: string };

const emptyForm: VehicleFormState = {
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
  outboundPriority: "0",
};

const formatPrice = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Math.round(n));

const formatPriceInput = (raw: string) => {
  const n = Number(raw);
  if (!raw.trim() || Number.isNaN(n)) return "";
  const num = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `$${num} mxn`;
};

const sanitizePriceDigits = (raw: string) => raw.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const parsePriceInt = (raw: string) => Math.round(Number(raw));
const PDF_MAX_BYTES = 8 * 1024 * 1024;

const validateTechnicalSheet = (file: File): string | null => {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Solo se permiten archivos PDF.";
  if (file.size > PDF_MAX_BYTES) return "El PDF no puede superar 8 MB.";
  return null;
};

const mediaBase = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api").replace(/\/api\/?$/, "");
const toMediaUrl = (value: string) => (value.startsWith("http") ? value : `${mediaBase}${value}`);
const vehicleEmojis = ["🚗", "🚙", "🚘", "🚕", "🚖", "🚐", "🚚", "🚛", "🛻", "🚜", "🏎️", "🚓", "🚑", "🚒", "🚌"];

const parseMetadataValue = (raw: string): string | number | boolean => {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (["true", "si", "sí", "yes"].includes(lower)) return true;
  if (["false", "no"].includes(lower)) return false;
  const numberValue = Number(trimmed);
  return Number.isNaN(numberValue) ? trimmed : numberValue;
};

const metadataToRows = (metadata?: Record<string, unknown> | null): MetadataRow[] => {
  if (!metadata || typeof metadata !== "object") return [];
  return Object.entries(metadata).map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    value: String(value ?? ""),
  }));
};

const rowsToMetadata = (rows: MetadataRow[]): Record<string, string | number | boolean> => {
  const result: Record<string, string | number | boolean> = {};
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key || !value) continue;
    result[key] = parseMetadataValue(value);
  }
  return result;
};

function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground mt-0.5">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function VehicleCardImage({ car }: { car: VehicleDto }) {
  const [broken, setBroken] = useState(false);
  const src = car.imageUrls?.[0] ? toMediaUrl(car.imageUrls[0]) : "";

  if (!src || broken) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-soft">
        <span className="text-4xl leading-none select-none" aria-hidden>
          {car.image || "🚗"}
        </span>
        <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wide">
          <Car className="w-3.5 h-3.5" aria-hidden />
          Sin foto
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${car.brand} ${car.model}`}
      className="absolute inset-0 h-full w-full object-cover"
      onError={() => setBroken(true)}
    />
  );
}

function FilePickerZone({
  label,
  hint,
  accept,
  multiple,
  icon: Icon,
  onFiles,
}: {
  label: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  icon: typeof ImagePlus;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-5 text-center transition-colors hover:border-primary/40 hover:bg-muted/40"
      >
        <Icon className="w-7 h-7 text-muted-foreground/60" />
        <span className="text-sm font-medium text-foreground">Elegir archivos</span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          onFiles(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default function ConfigProductos() {
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => crmApi.getVehicles(token!),
    enabled: Boolean(token),
  });
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
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [q, setQ] = useState("");
  const [updating, setUpdating] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [vehicleFormError, setVehicleFormError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [selectedTechnicalSheet, setSelectedTechnicalSheet] = useState<File | null>(null);
  const [technicalSheetUrl, setTechnicalSheetUrl] = useState("");
  const [technicalSheetPreviewUrl, setTechnicalSheetPreviewUrl] = useState("");
  const [priceFocused, setPriceFocused] = useState(false);
  const [metadataRows, setMetadataRows] = useState<MetadataRow[]>([]);
  const [form, setForm] = useState<VehicleFormState>(emptyForm);
  const focusedVehicleId = searchParams.get("vehicleId");

  const filterCounts = useMemo(() => {
    const counts: Record<ProductFilter, number> = {
      all: cars.length,
      available: 0,
      reserved: 0,
      sold: 0,
      noFinancing: 0,
      noPromos: 0,
    };
    for (const car of cars) {
      if (car.status in counts) counts[car.status as CarStatus] += 1;
      if (!car.financingPlans?.length) counts.noFinancing += 1;
      if (linkedPromoCountForVehicle(car.id, promotions) === 0) counts.noPromos += 1;
    }
    return counts;
  }, [cars, promotions]);

  const list = useMemo(() => {
    return cars.filter((c) => {
      let okF = true;
      if (filter === "noFinancing") okF = !c.financingPlans?.length;
      else if (filter === "noPromos") okF = linkedPromoCountForVehicle(c.id, promotions) === 0;
      else if (filter !== "all") okF = c.status === filter;
      const okQ = !q || `${c.brand} ${c.model}`.toLowerCase().includes(q.toLowerCase());
      return okF && okQ;
    });
  }, [cars, filter, q, promotions]);

  const isFormValid =
    Boolean(form.brand && form.model && form.year && form.price && form.transmission && form.engine && form.color);

  const editingVehicle = useMemo(
    () => (editingId ? cars.find((car) => car.id === editingId) ?? null : null),
    [cars, editingId],
  );

  useEffect(() => {
    if (!focusedVehicleId) return;
    const element = document.getElementById(`vehicle-${focusedVehicleId}`);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedVehicleId, list.length]);

  const [selectedFilePreviews, setSelectedFilePreviews] = useState<string[]>([]);

  useEffect(() => {
    if (selectedTechnicalSheet) {
      const objectUrl = URL.createObjectURL(selectedTechnicalSheet);
      setTechnicalSheetPreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
    setTechnicalSheetPreviewUrl(technicalSheetUrl ? toMediaUrl(technicalSheetUrl) : "");
  }, [selectedTechnicalSheet, technicalSheetUrl]);

  useEffect(() => {
    const previews = selectedFiles.map((file) => URL.createObjectURL(file));
    setSelectedFilePreviews(previews);
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [selectedFiles]);

  const resetVehicleForm = () => {
    setEditingId(null);
    setSelectedFiles([]);
    setImageUrls([]);
    setSelectedTechnicalSheet(null);
    setTechnicalSheetUrl("");
    setPriceFocused(false);
    setMetadataRows([]);
    setForm(emptyForm);
    setVehicleFormError("");
    setDeleteOpen(false);
    setDeleteError("");
  };

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
    setSelectedTechnicalSheet(null);
    setTechnicalSheetUrl(car.technicalSheetUrl || "");
    setPriceFocused(false);
    setMetadataRows(metadataToRows(car.metadata as Record<string, unknown> | undefined));
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
      outboundPriority: String(car.outboundPriority ?? 0),
    });
    setVehicleFormError("");
    setCreateOpen(true);
  };

  const saveVehicle = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!token || !isFormValid) return;
    setCreating(true);
    setVehicleFormError("");
    try {
      if (selectedTechnicalSheet) {
        const pdfError = validateTechnicalSheet(selectedTechnicalSheet);
        if (pdfError) {
          setVehicleFormError(pdfError);
          return;
        }
      }
      const uploaded = selectedFiles.length > 0 ? (await crmApi.uploadVehicleImages(token, selectedFiles)).imageUrls : [];
      let finalTechnicalSheetUrl: string | null = technicalSheetUrl || null;
      if (selectedTechnicalSheet) {
        finalTechnicalSheetUrl = (await crmApi.uploadVehicleTechnicalSheet(token, selectedTechnicalSheet)).technicalSheetUrl;
      }
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
        technicalSheetUrl: finalTechnicalSheetUrl,
        metadata: rowsToMetadata(metadataRows),
        outboundPriority: Number(form.outboundPriority || "0"),
      };
      if (editingId) {
        await crmApi.updateVehicle(token, editingId, payload);
      } else {
        await crmApi.createVehicle(token, payload);
      }
      await queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setCreateOpen(false);
      resetVehicleForm();
    } catch (err) {
      setVehicleFormError(normalizeApiError(err, "No se pudo guardar el vehículo.").formError);
    } finally {
      setCreating(false);
    }
  };

  const deleteVehicle = async () => {
    if (!token || !editingId) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await crmApi.deleteVehicle(token, editingId);
      await queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      await queryClient.invalidateQueries({ queryKey: ["promotions"] });
      setDeleteOpen(false);
      setCreateOpen(false);
      resetVehicleForm();
    } catch (err) {
      setDeleteError(normalizeApiError(err, "No se pudo eliminar el vehículo.").formError);
    } finally {
      setDeleting(false);
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

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((current) => current.filter((_, i) => i !== index));
  };

  const addMetadataRow = () => {
    setMetadataRows((rows) => [...rows, { id: crypto.randomUUID(), key: "", value: "" }]);
  };

  const updateMetadataRow = (id: string, field: "key" | "value", next: string) => {
    setMetadataRows((rows) => rows.map((row) => (row.id === id ? { ...row, [field]: next } : row)));
  };

  const removeMetadataRow = (id: string) => {
    setMetadataRows((rows) => rows.filter((row) => row.id !== id));
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
                onClick={resetVehicleForm}
              >
                <Plus className="w-4 h-4" /> Auto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md p-0 gap-0 max-h-[92vh] flex flex-col overflow-hidden">
              <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0 text-left">
                <DialogTitle>{editingId ? "Editar auto" : "Nuevo auto"}</DialogTitle>
                <DialogDescription>
                  {editingId
                    ? "Actualiza los datos del vehículo en tu catálogo."
                    : "Completa la información para publicar el vehículo."}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={saveVehicle} className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                  <FormSection title="Identificación" description="Marca, modelo y precio de lista.">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="brand">Marca *</Label>
                        <Input
                          id="brand"
                          placeholder="Volkswagen"
                          value={form.brand}
                          onChange={(e) => setForm((s) => ({ ...s, brand: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="model">Modelo *</Label>
                        <Input
                          id="model"
                          placeholder="Tiguan"
                          value={form.model}
                          onChange={(e) => setForm((s) => ({ ...s, model: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="year">Año *</Label>
                        <Input
                          id="year"
                          type="number"
                          placeholder="2024"
                          value={form.year}
                          onChange={(e) => setForm((s) => ({ ...s, year: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="price">Precio *</Label>
                        <Input
                          id="price"
                          type="text"
                          inputMode="decimal"
                          placeholder="629900"
                          value={priceFocused ? form.price : formatPriceInput(form.price)}
                          onFocus={() => setPriceFocused(true)}
                          onBlur={() => setPriceFocused(false)}
                          onChange={(e) => setForm((s) => ({ ...s, price: sanitizePriceDigits(e.target.value) }))}
                        />
                      </div>
                    </div>
                  </FormSection>

                  <Separator />

                  <FormSection title="Especificaciones" description="Detalles técnicos visibles para el cliente.">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="km">Kilometraje</Label>
                        <Input
                          id="km"
                          type="number"
                          placeholder="0"
                          value={form.km}
                          onChange={(e) => setForm((s) => ({ ...s, km: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="color">Color *</Label>
                        <Input
                          id="color"
                          placeholder="Gris"
                          value={form.color}
                          onChange={(e) => setForm((s) => ({ ...s, color: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="transmission">Transmisión *</Label>
                        <Input
                          id="transmission"
                          placeholder="Automática"
                          value={form.transmission}
                          onChange={(e) => setForm((s) => ({ ...s, transmission: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="engine">Motor *</Label>
                        <Input
                          id="engine"
                          placeholder="1.4L Turbo"
                          value={form.engine}
                          onChange={(e) => setForm((s) => ({ ...s, engine: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Emoji</Label>
                        <Select value={form.image} onValueChange={(value) => setForm((s) => ({ ...s, image: value }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Elegir emoji" />
                          </SelectTrigger>
                          <SelectContent>
                            {!vehicleEmojis.includes(form.image) ? (
                              <SelectItem value={form.image}>{form.image || "🚗"}</SelectItem>
                            ) : null}
                            {vehicleEmojis.map((emoji) => (
                              <SelectItem key={emoji} value={emoji}>
                                {emoji}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="priority">Prioridad de envío</Label>
                        <Input
                          id="priority"
                          type="number"
                          min={0}
                          placeholder="0"
                          value={form.outboundPriority}
                          onChange={(e) => setForm((s) => ({ ...s, outboundPriority: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Estatus</Label>
                      <Select
                        value={form.status}
                        onValueChange={(value) => setForm((s) => ({ ...s, status: value as CarStatus }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(statusLabels) as CarStatus[]).map((status) => (
                            <SelectItem key={status} value={status}>
                              {statusLabels[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </FormSection>

                  <Separator />

                  <FormSection title="Medios" description="Imágenes y ficha técnica del vehículo.">
                    <FilePickerZone
                      label="Imágenes"
                      hint="JPG, PNG o WebP · varias permitidas"
                      accept="image/*"
                      multiple
                      icon={ImagePlus}
                      onFiles={(files) => setSelectedFiles((current) => [...current, ...files])}
                    />

                    {selectedFiles.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2">
                        {selectedFiles.map((file, index) => (
                          <div key={`${file.name}-${index}`} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                            <img
                              src={selectedFilePreviews[index]}
                              alt={file.name}
                              className="h-full w-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removeSelectedFile(index)}
                              className="absolute top-1 right-1 rounded-full bg-background/90 p-0.5 shadow-sm hover:bg-background"
                              aria-label={`Quitar ${file.name}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {imageUrls.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Imágenes actuales · la primera es la portada</p>
                        {imageUrls.map((url, index) => (
                          <div key={`${url}-${index}`} className="flex items-center gap-2 rounded-lg border border-border p-2 bg-card">
                            <div className="relative shrink-0">
                              <img src={toMediaUrl(url)} alt={`Imagen ${index + 1}`} className="w-14 h-14 rounded-md object-cover" />
                              {index === 0 ? (
                                <span className="absolute -top-1 -left-1 rounded bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                                  PORTADA
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[11px] text-muted-foreground flex-1 truncate">{url.split("/").pop()}</p>
                            <div className="flex gap-0.5 shrink-0">
                              <Button type="button" size="icon" variant="outline" className="h-7 w-7" disabled={index === 0} onClick={() => moveImage(index, "up")}>
                                <ArrowUp className="w-3.5 h-3.5" />
                              </Button>
                              <Button type="button" size="icon" variant="outline" className="h-7 w-7" disabled={index === imageUrls.length - 1} onClick={() => moveImage(index, "down")}>
                                <ArrowDown className="w-3.5 h-3.5" />
                              </Button>
                              <Button type="button" size="icon" variant="destructive" className="h-7 w-7" onClick={() => removeImage(index)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {technicalSheetUrl || selectedTechnicalSheet ? (
                      <div className="space-y-1.5">
                        <Label>Ficha técnica (PDF)</Label>
                        <div className="flex items-center gap-2 rounded-lg border border-border p-2.5 bg-card">
                          <div className="relative w-12 h-12 shrink-0 rounded-md border border-border bg-muted overflow-hidden flex items-center justify-center">
                            {technicalSheetPreviewUrl ? (
                              <embed src={technicalSheetPreviewUrl} type="application/pdf" className="w-full h-full pointer-events-none" />
                            ) : (
                              <FileText className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                          {technicalSheetUrl ? (
                            <a href={toMediaUrl(technicalSheetUrl)} target="_blank" rel="noreferrer" className="text-xs text-primary truncate flex-1 hover:underline">
                              {technicalSheetUrl.split("/").pop()}
                            </a>
                          ) : (
                            <p className="text-xs text-muted-foreground flex-1 truncate">{selectedTechnicalSheet?.name}</p>
                          )}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => {
                              setTechnicalSheetUrl("");
                              setSelectedTechnicalSheet(null);
                            }}
                            aria-label="Eliminar ficha técnica"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Elimina la ficha actual para subir otra.</p>
                      </div>
                    ) : (
                      <FilePickerZone
                        label="Ficha técnica (PDF)"
                        hint="Máximo 8 MB · una por vehículo"
                        accept="application/pdf,.pdf"
                        icon={FileText}
                        onFiles={(files) => {
                          const file = files[0];
                          if (!file) return;
                          const pdfError = validateTechnicalSheet(file);
                          if (pdfError) {
                            setVehicleFormError(pdfError);
                            setSelectedTechnicalSheet(null);
                            return;
                          }
                          setVehicleFormError("");
                          setSelectedTechnicalSheet(file);
                        }}
                      />
                    )}
                  </FormSection>

                  <Separator />

                  <FormSection title="Información adicional" description="Opcional · visible para el asesor y el bot.">
                    <div className="space-y-2">
                      {metadataRows.length === 0 ? (
                        <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border px-3 py-4 text-center">
                          Sin datos extra. Agrega características como combustible, puertas o versión.
                        </p>
                      ) : (
                        metadataRows.map((row) => (
                          <div key={row.id} className="flex gap-2 items-start">
                            <Input
                              placeholder="Puertas"
                              value={row.key}
                              onChange={(e) => updateMetadataRow(row.id, "key", e.target.value)}
                              className="flex-1"
                            />
                            <Input
                              placeholder="Cinco"
                              value={row.value}
                              onChange={(e) => updateMetadataRow(row.id, "value", e.target.value)}
                              className="flex-1"
                            />
                            <Button type="button" size="icon" variant="ghost" className="shrink-0 h-10 w-10" onClick={() => removeMetadataRow(row.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))
                      )}
                      <Button type="button" variant="outline" size="sm" className="w-full" onClick={addMetadataRow}>
                        <Plus className="w-4 h-4 mr-1" /> Agregar dato
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="description">Descripción</Label>
                      <Textarea
                        id="description"
                        placeholder="Resumen comercial del vehículo"
                        rows={3}
                        value={form.description}
                        onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                      />
                    </div>
                    {editingId ? (
                      <div className="pt-2 border-t border-border">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={creating || deleting}
                          onClick={() => {
                            setDeleteError("");
                            setDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Eliminar auto
                        </Button>
                      </div>
                    ) : null}
                  </FormSection>
                </div>

                <div className="shrink-0 border-t bg-muted/20 px-5 py-4 space-y-2">
                  <Button type="submit" className="w-full" disabled={creating || deleting || !isFormValid}>
                    {creating ? "Guardando…" : editingId ? "Guardar cambios" : "Crear auto"}
                  </Button>
                  {!isFormValid ? (
                    <p className="text-[11px] text-center text-muted-foreground">Completa los campos marcados con *</p>
                  ) : null}
                  <FormErrorAlert title="No se pudo guardar el vehículo" message={vehicleFormError} />
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="px-4 py-3 space-y-3 sticky top-[65px] bg-background/95 backdrop-blur z-10 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar marca o modelo…"
            className="w-full h-11 pl-10 pr-10 rounded-xl bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-background/80"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-0.5">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3.5 h-8 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border",
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              )}
            >
              {f.label}
              <span
                className={cn(
                  "tabular-nums rounded-full px-1.5 py-px text-[10px] font-bold",
                  filter === f.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {filterCounts[f.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 py-4 grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-border overflow-hidden">
              <Skeleton className="aspect-[4/3] w-full rounded-none" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Car className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <p className="font-semibold text-sm">Sin vehículos</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-[240px] mx-auto">
            {q || filter !== "all"
              ? "No hay resultados con ese filtro. Prueba otra búsqueda."
              : "Agrega tu primer auto con el botón de arriba."}
          </p>
        </div>
      ) : (
        <div className="px-4 py-4 grid grid-cols-2 gap-3 pb-6">
          {list.map((c) => {
            const linkedPromoCount = linkedPromoCountForVehicle(c.id, promotions);
            const hasFinancing = Boolean(c.financingPlans?.length);
            const financingLabel = hasFinancing
              ? c.financingPlans![0].showRate
                ? `${Number(c.financingPlans![0].rate).toFixed(1)}%`
                : "Sí"
              : null;

            return (
              <article
                id={`vehicle-${c.id}`}
                key={c.id}
                className={cn(
                  "group flex flex-col bg-card rounded-2xl shadow-card border border-border overflow-hidden transition-shadow duration-200 hover:shadow-elevated",
                  focusedVehicleId === c.id ? "ring-2 ring-primary/60" : ""
                )}
              >
                <button
                  type="button"
                  className="relative aspect-[4/3] bg-muted/80 overflow-hidden text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset"
                  onClick={() => startEditVehicle(c)}
                  aria-label={`Editar ${c.brand} ${c.model}`}
                >
                  <VehicleCardImage car={c} />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/30 to-transparent" />
                  <div className="absolute bottom-2 right-2 pointer-events-none">
                    <StatusBadge status={c.status} />
                  </div>
                </button>

                <div className="flex flex-1 flex-col p-3">
                  <button
                    type="button"
                    className="space-y-0.5 min-h-[3.25rem] text-left w-full cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    onClick={() => startEditVehicle(c)}
                    aria-label={`Editar ${c.brand} ${c.model}`}
                  >
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide leading-none truncate">
                      {c.brand}
                    </p>
                    <p className="font-bold text-sm leading-snug line-clamp-2">{c.model}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.year} · {c.km.toLocaleString("es-MX")} km
                    </p>
                    <p className="font-extrabold text-primary-dark text-base tabular-nums tracking-tight mt-2">
                      {formatPrice(c.price)}
                    </p>
                  </button>

                  <div className="flex flex-wrap gap-1 mt-2">
                    {(c.outboundPriority ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <Gauge className="w-3 h-3 shrink-0" />
                        P{c.outboundPriority}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                        hasFinancing ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Landmark className="w-3 h-3 shrink-0" />
                      {hasFinancing ? financingLabel : "Sin plan"}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                        linkedPromoCount > 0 ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Tag className="w-3 h-3 shrink-0" />
                      {linkedPromoCount > 0 ? linkedPromoCount : "0"}
                    </span>
                  </div>

                  <div className="mt-auto pt-2.5 space-y-1.5">
                    <Button size="sm" variant="secondary" className="h-8 w-full rounded-lg text-xs" onClick={() => startEditVehicle(c)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                    </Button>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="h-8 w-full rounded-lg text-[11px] px-2">
                            <span className="inline-flex items-center gap-1">
                              <Tag className="w-3.5 h-3.5 shrink-0" />
                              Promos
                            </span>
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Promociones</DialogTitle>
                            <DialogDescription>
                              {c.brand} {c.model} · {c.year}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                            {promotions.length === 0 ? (
                              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                                <Tag className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                                <p className="text-sm font-medium">Sin promociones</p>
                                <p className="text-xs text-muted-foreground mt-1">Créalas en Vehículos → Promociones.</p>
                              </div>
                            ) : (
                              promotions.map((promo) => {
                                const ids = Array.isArray(promo.vehicleIds) ? promo.vehicleIds.map(String) : [];
                                const selected = ids.includes(String(c.id));
                                const key = `pr:${c.id}:${promo.id}`;
                                return (
                                  <label
                                    key={promo.id}
                                    className={cn(
                                      "flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors",
                                      selected ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40"
                                    )}
                                  >
                                    <Checkbox
                                      checked={selected}
                                      disabled={updating === key}
                                      onCheckedChange={() => togglePromotionForVehicle(c.id, promo, selected)}
                                      className="mt-0.5"
                                    />
                                    <span className="text-sm min-w-0 flex-1">
                                      <span className="font-semibold block leading-snug">{promo.title}</span>
                                      {!promo.active ? (
                                        <span className="text-[10px] text-muted-foreground">Inactiva</span>
                                      ) : null}
                                    </span>
                                    {updating === key ? <Check className="w-4 h-4 shrink-0 text-success" /> : null}
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="h-8 w-full rounded-lg text-[11px] px-2">
                            <span className="inline-flex items-center gap-1">
                              <Landmark className="w-3.5 h-3.5 shrink-0" />
                              Planes
                            </span>
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Planes de financiamiento</DialogTitle>
                            <DialogDescription>
                              {c.brand} {c.model} · {c.year}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                            {plans.length === 0 ? (
                              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                                <Landmark className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                                <p className="text-sm font-medium">Sin planes</p>
                                <p className="text-xs text-muted-foreground mt-1">Configúralos en Vehículos → Financiamiento.</p>
                              </div>
                            ) : (
                              plans.map((plan) => {
                                const selected = Boolean(c.financingPlans?.some((x) => x.id === plan.id));
                                const key = `fp:${c.id}:${plan.id}`;
                                return (
                                  <label
                                    key={plan.id}
                                    className={cn(
                                      "flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors",
                                      selected ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40"
                                    )}
                                  >
                                    <Checkbox
                                      checked={selected}
                                      disabled={updating === key}
                                      onCheckedChange={() => togglePlanForVehicle(c.id, plan.id, selected)}
                                      className="mt-0.5"
                                    />
                                    <span className="text-sm min-w-0 flex-1">
                                      <span className="font-semibold block leading-snug">{plan.name}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {plan.lender} · {plan.showRate ? `${Number(plan.rate).toFixed(2)}%` : "Tasa oculta"}
                                      </span>
                                    </span>
                                    {updating === key ? <Check className="w-4 h-4 shrink-0 text-success" /> : null}
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteError("");
        }}
      >
        <DialogContent className="max-w-md overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Eliminar auto</DialogTitle>
            <DialogDescription>Esta acción no se puede deshacer. Se quitará del catálogo y de promociones vinculadas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-semibold break-words">
              {editingVehicle ? `${editingVehicle.brand} ${editingVehicle.model} · ${editingVehicle.year}` : "Vehículo seleccionado"}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="w-full" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                Cancelar
              </Button>
              <Button variant="destructive" className="w-full" disabled={deleting} onClick={deleteVehicle}>
                {deleting ? "Eliminando…" : "Sí, eliminar"}
              </Button>
            </div>
            <FormErrorAlert title="No se pudo eliminar el vehículo" message={deleteError} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
