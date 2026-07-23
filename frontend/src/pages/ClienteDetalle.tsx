import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Phone, MessageCircle, Car, FileText, Landmark, Tag, Pencil, Trash2, SlidersHorizontal } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { ChannelIcon } from "@/components/ChannelIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/context/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConversationsQuery } from "@/hooks/useConversationsQuery";
import { crmApi } from "@/services/crm";
import type { ConversationDto } from "@/services/crm";
import { buildTelHref, resolveClientDisplayPhone } from "@/lib/phone";
import { normalizeApiError } from "@/lib/formErrors";
import { toast } from "sonner";

type SellerNotesJson = {
  customer_info?: {
    nombre?: string;
    telefono?: string;
    email?: string;
  };
  financing_selection?: {
    plan_id?: string;
    plan_name?: string;
    lender?: string;
    vehicle_id?: string;
    vehicle_name?: string;
  };
  promotion_selection?: {
    promotion_id?: string;
    title?: string;
    description?: string;
    valid_until?: string;
    vehicle_ids?: string[];
    vehicle_id?: string;
    vehicle_name?: string;
  };
  purchase_preferences?: {
    transmission?: "automatico" | "estandar" | string;
    payment_type?: "contado" | "financiado" | string;
  };
};

function parseSellerNotes(notes: string): SellerNotesJson | null {
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as SellerNotesJson) : null;
  } catch {
    return null;
  }
}

function formatTransmissionLabel(value?: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "automatico") return "Automático";
  if (normalized === "estandar") return "Estándar";
  return value?.trim() || "";
}

function formatPaymentTypeLabel(value?: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "contado") return "Contado";
  if (normalized === "financiado") return "Financiado";
  return value?.trim() || "";
}

function buildVehicleHref(vehicleId?: string) {
  if (!vehicleId?.trim()) return "/vehiculos/productos";
  return `/vehiculos/productos?vehicleId=${encodeURIComponent(vehicleId)}`;
}

function buildPlanHref(planId?: string) {
  if (!planId?.trim()) return "/vehiculos/financiamiento";
  return `/vehiculos/financiamiento?planId=${encodeURIComponent(planId)}`;
}

function buildPromotionHref(promotionId?: string) {
  if (!promotionId?.trim()) return "/vehiculos/promociones";
  return `/vehiculos/promociones?promotionId=${encodeURIComponent(promotionId)}`;
}

export default function ClienteDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data: client } = useQuery({
    queryKey: ["client", id],
    queryFn: () => crmApi.getClient(token!, id!),
    enabled: Boolean(token && id),
  });
  const { data: conversations } = useConversationsQuery();
  const conv = (conversations || []).find((c: ConversationDto) => c.clientLeadId === id || c.clientId === id);
  const convMessages = Array.isArray(conv?.messages) ? conv.messages : [];
  const parsedNotes = client?.notes ? parseSellerNotes(client.notes) : null;
  const customerInfo = parsedNotes?.customer_info;
  const financingSelection = parsedNotes?.financing_selection;
  const promotionSelection = parsedNotes?.promotion_selection;
  const purchasePreferences = parsedNotes?.purchase_preferences;
  const transmissionLabel = formatTransmissionLabel(purchasePreferences?.transmission);
  const paymentTypeLabel = formatPaymentTypeLabel(purchasePreferences?.payment_type);
  const hasPurchasePreferences = Boolean(transmissionLabel || paymentTypeLabel);
  const interestedVehicleName = financingSelection?.vehicle_name || promotionSelection?.vehicle_name || client?.interestedIn;
  const interestedVehicleId = financingSelection?.vehicle_id || promotionSelection?.vehicle_id;

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ name: "", displayPhone: "" });

  useEffect(() => {
    if (!client) return;
    setForm({
      name: client.name || "",
      displayPhone: resolveClientDisplayPhone(client),
    });
  }, [client]);

  const clientDisplayPhone = resolveClientDisplayPhone(client);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!client) throw new Error("Cliente no disponible");
      return crmApi.updateClient(token!, id!, {
        name: form.name.trim(),
        displayPhone: form.displayPhone.trim() || null,
        status: client.status,
        interestedIn: client.interestedIn?.trim() || null,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client", id] }),
        queryClient.invalidateQueries({ queryKey: ["clients"] }),
      ]);
      setEditOpen(false);
      setFormError("");
      toast.success("Cliente actualizado.");
    },
    onError: (error: unknown) => setFormError(normalizeApiError(error, "No se pudo actualizar el cliente.").formError),
  });

  const deleteMutation = useMutation({
    mutationFn: () => crmApi.deleteClient(token!, id!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente eliminado.");
      navigate("/clientes");
    },
    onError: (error: unknown) => toast.error(normalizeApiError(error, "No se pudo eliminar el cliente.").formError),
  });

  const telHref = buildTelHref(clientDisplayPhone);

  const handleCall = () => {
    if (!telHref) {
      toast.error("No hay un número de teléfono válido para llamar.");
      return;
    }
    window.location.href = telHref;
  };

  const handleChat = () => {
    if (!conv?.id) {
      toast.error("No hay conversación activa con este cliente.");
      return;
    }
    navigate(`/chat/${conv.id}`);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      setFormError("El nombre es obligatorio.");
      return;
    }
    setFormError("");
    updateMutation.mutate();
  };

  if (!client) {
    return (
      <>
        <ScreenHeader title="Cliente" back />
        <div className="p-6 text-center text-sm text-muted-foreground">Cliente no encontrado</div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title="Detalle del cliente"
        back
        action={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setFormError("");
                setEditOpen(true);
              }}
              className="w-9 h-9 grid place-items-center rounded-full hover:bg-muted touch-manipulation"
              aria-label="Editar cliente"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="w-9 h-9 grid place-items-center rounded-full hover:bg-destructive/10 text-destructive touch-manipulation"
              aria-label="Eliminar cliente"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        }
      />

      <div className="px-4 py-5 space-y-4">
        <div className="bg-card rounded-2xl p-5 shadow-card border border-border flex flex-col items-center text-center">
          <div className="relative">
            <Avatar name={client.name} color={client.avatarColor} size="lg" />
            <ChannelIcon channel={client.channel} size={12} className="absolute -bottom-1 -right-1 ring-2 ring-card" />
          </div>
          <h2 className="mt-3 font-bold text-lg">{client.name}</h2>
          <p className="text-xs text-muted-foreground">{clientDisplayPhone || "Teléfono no disponible"}</p>
          <div className="mt-3">
            <StatusBadge status={client.status} />
          </div>

          <div className="grid grid-cols-2 gap-2 w-full mt-4">
            <Button variant="outline" className="h-10 rounded-xl gap-2" onClick={handleCall}>
              <Phone className="w-4 h-4" /> Llamar
            </Button>
            <Button className="h-10 rounded-xl gap-2 shadow-green" onClick={handleChat}>
              <MessageCircle className="w-4 h-4" /> Chat
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
          <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-3">Auto de interés</h3>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent grid place-items-center text-accent-foreground">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <p className="font-semibold text-sm">{interestedVehicleName || "Sin auto de interés"}</p>
              {interestedVehicleId ? (
                <Link to={buildVehicleHref(interestedVehicleId)} className="text-xs text-primary underline underline-offset-2">
                  Ver ficha del auto
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {hasPurchasePreferences && (
          <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
            <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-3">Preferencias de compra</h3>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-accent grid place-items-center text-accent-foreground">
                <SlidersHorizontal className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                {transmissionLabel ? (
                  <p className="font-semibold text-sm">
                    <span className="text-muted-foreground font-medium">Transmisión:</span> {transmissionLabel}
                  </p>
                ) : null}
                {paymentTypeLabel ? (
                  <p className="font-semibold text-sm">
                    <span className="text-muted-foreground font-medium">Pago:</span> {paymentTypeLabel}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {financingSelection?.plan_name && (
          <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
            <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-3">Plan de financiamiento</h3>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-accent grid place-items-center text-accent-foreground">
                <Landmark className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <p className="font-semibold text-sm">{financingSelection.plan_name}</p>
                {financingSelection.lender && <p className="text-xs text-muted-foreground">{financingSelection.lender}</p>}
                <Link to={buildPlanHref(financingSelection.plan_id)} className="text-xs text-primary underline underline-offset-2">
                  Ver plan de financiamiento
                </Link>
              </div>
            </div>
          </div>
        )}

        {promotionSelection?.title && (
          <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
            <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-3">Promoción seleccionada</h3>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-accent grid place-items-center text-accent-foreground">
                <Tag className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <p className="font-semibold text-sm">{promotionSelection.title}</p>
                {promotionSelection.description && <p className="text-xs text-muted-foreground">{promotionSelection.description}</p>}
                {promotionSelection.valid_until && (
                  <p className="text-xs text-muted-foreground">Válida hasta: {promotionSelection.valid_until}</p>
                )}
                <Link to={buildPromotionHref(promotionSelection.promotion_id)} className="text-xs text-primary underline underline-offset-2">
                  Ver promoción
                </Link>
              </div>
            </div>
          </div>
        )}

        {client.notes && (
          <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
            <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-2 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" /> Notas del vendedor
            </h3>
            {parsedNotes ? (
              <div className="space-y-2 text-sm text-foreground leading-relaxed">
                {customerInfo?.nombre && <p><span className="font-semibold">Nombre:</span> {customerInfo.nombre}</p>}
                {customerInfo?.telefono && <p><span className="font-semibold">Teléfono:</span> {customerInfo.telefono}</p>}
                {customerInfo?.email && <p><span className="font-semibold">Email:</span> {customerInfo.email}</p>}
                {!customerInfo?.nombre && !customerInfo?.telefono && !customerInfo?.email && (
                  <p className="text-muted-foreground">Sin notas adicionales de cliente.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{client.notes}</p>
            )}
          </div>
        )}

        {conv && convMessages.length > 0 && (
          <div className="bg-card rounded-2xl p-4 shadow-card border border-border">
            <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-3">Últimos mensajes</h3>
            <div className="space-y-2">
              {convMessages.slice(-3).map((m) => (
                <div
                  key={m.id}
                  className={`p-3 rounded-xl text-sm ${
                    m.from === "client" ? "bg-muted text-foreground" : "bg-accent text-accent-foreground"
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-1 opacity-70">
                    {m.from === "client" ? client.name : m.from === "bot" ? "🤖 Bot" : "Tú"}
                  </p>
                  {m.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={(open) => !updateMutation.isPending && setEditOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
            <DialogDescription>Actualiza los datos principales del contacto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <FormErrorAlert message={formError} />
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input
                className="mt-1"
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Teléfono</Label>
              <Input
                className="mt-1"
                value={form.displayPhone}
                onChange={(e) => setForm((s) => ({ ...s, displayPhone: e.target.value }))}
                placeholder="Ej. 6181556489"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={(open) => !deleteMutation.isPending && setDeleteOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Se ocultará <span className="font-semibold">{client.name}</span> de tu lista de clientes. Las conversaciones
              históricas se conservan y el contacto podrá reactivarse si vuelve a escribir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate();
              }}
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
