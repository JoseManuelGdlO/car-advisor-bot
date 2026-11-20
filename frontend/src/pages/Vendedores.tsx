import { FormEvent, useState } from "react";
import { Pencil, Plus, RotateCcw, UserMinus, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { useAuth } from "@/context/AuthContext";
import { normalizeApiError } from "@/lib/formErrors";
import { cn } from "@/lib/utils";
import { describeDeactivation, sellersApi, type SellerDto } from "@/services/sellers";

type View = "active" | "inactive";

type FormState = { name: string; email: string; phone: string; password: string };
const EMPTY_FORM: FormState = { name: "", email: "", phone: "", password: "" };

const leadsLabel = (count?: number) => {
  const n = count ?? 0;
  return n === 1 ? "1 lead asignado" : `${n} leads asignados`;
};

export default function Vendedores() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("active");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SellerDto | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  const [deactivating, setDeactivating] = useState<SellerDto | null>(null);
  const [deactivateError, setDeactivateError] = useState("");

  const { data: sellers = [], isLoading } = useQuery({
    queryKey: ["sellers", "all"],
    queryFn: () => sellersApi.list(token!, { includeInactive: true }),
    enabled: Boolean(token),
  });

  const activeSellers = sellers.filter((s) => s.active);
  const inactiveSellers = sellers.filter((s) => !s.active);
  const visible = view === "active" ? activeSellers : inactiveSellers;

  const refreshLists = async () => {
    await queryClient.invalidateQueries({ queryKey: ["sellers"] });
    await queryClient.invalidateQueries({ queryKey: ["clients"] });
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      const email = form.email.trim();
      const phone = form.phone.trim();
      if (editing) {
        return sellersApi.update(token!, editing.id, {
          name,
          email,
          phone: phone || null,
          ...(form.password ? { password: form.password } : {}),
        });
      }
      return sellersApi.create(token!, { name, email, password: form.password, ...(phone ? { phone } : {}) });
    },
    onSuccess: async () => {
      toast.success(editing ? "Vendedor actualizado." : "Vendedor creado.");
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      setFormError("");
      await refreshLists();
    },
    onError: (error) => {
      setFormError(normalizeApiError(error, "No se pudo guardar el vendedor.").formError);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (seller: SellerDto) => sellersApi.deactivate(token!, seller.id),
    onSuccess: async (result) => {
      toast.success(describeDeactivation(result.unassignedLeads));
      setDeactivating(null);
      setDeactivateError("");
      await refreshLists();
    },
    onError: (error) => {
      setDeactivateError(normalizeApiError(error, "No se pudo dar de baja al vendedor.").formError);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (seller: SellerDto) => sellersApi.restore(token!, seller.id),
    onSuccess: async () => {
      toast.success("Vendedor reactivado. Sus leads siguen sin asignar hasta que los reasignes.");
      await refreshLists();
    },
    onError: (error) => {
      toast.error(normalizeApiError(error, "No se pudo reactivar al vendedor.").formError);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (seller: SellerDto) => {
    setEditing(seller);
    setForm({ name: seller.name, email: seller.email, phone: seller.phone ?? "", password: "" });
    setFormError("");
    setFormOpen(true);
  };

  const canSubmit = Boolean(
    form.name.trim().length >= 2 && form.email.trim() && (editing ? true : form.password.length >= 6),
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canSubmit) return;
    setFormError("");
    saveMutation.mutate();
  };

  return (
    <>
      <ScreenHeader
        title="Vendedores"
        subtitle={`${activeSellers.length} activos`}
        back
        action={
          <Button size="sm" className="rounded-full h-9 px-3 shadow-green" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Nuevo
          </Button>
        }
      />

      <div className="px-4 pt-4">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1" role="tablist" aria-label="Estado de vendedores">
          {(
            [
              { key: "active", label: `Activos (${activeSellers.length})` },
              { key: "inactive", label: `Inactivos (${inactiveSellers.length})` },
            ] as { key: View; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={view === tab.key}
              onClick={() => setView(tab.key)}
              className={cn(
                "h-9 rounded-full text-xs font-semibold transition-colors",
                view === tab.key ? "bg-card text-foreground shadow-soft" : "text-muted-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="px-4 py-4 space-y-3">
        {visible.map((seller) => (
          <li key={seller.id} className="bg-card rounded-2xl p-4 shadow-card border border-border">
            <div className="flex items-center gap-3">
              <Avatar name={seller.name} color={seller.active ? undefined : "hsl(var(--muted-foreground))"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{seller.name}</p>
                <p className="text-xs text-muted-foreground truncate">{seller.email}</p>
                {seller.phone ? <p className="text-xs text-muted-foreground truncate">{seller.phone}</p> : null}
                {seller.active ? (
                  <p className="mt-1 text-[11px] font-medium text-primary-dark">{leadsLabel(seller.assignedLeadsCount)}</p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-end gap-1 mt-2 -mr-1">
              <button
                className="text-muted-foreground hover:text-foreground p-2 rounded-lg"
                aria-label={`Editar ${seller.name}`}
                onClick={() => openEdit(seller)}
              >
                <Pencil className="w-4 h-4" />
              </button>
              {seller.active ? (
                <button
                  className="text-muted-foreground hover:text-destructive p-2 rounded-lg"
                  aria-label={`Dar de baja a ${seller.name}`}
                  onClick={() => {
                    setDeactivateError("");
                    setDeactivating(seller);
                  }}
                >
                  <UserMinus className="w-4 h-4" />
                </button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={restoreMutation.isPending}
                  onClick={() => restoreMutation.mutate(seller)}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reactivar
                </Button>
              )}
            </div>
          </li>
        ))}
        {!isLoading && visible.length === 0 ? (
          <li className="px-4 py-12 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 h-6 w-6" />
            {view === "active"
              ? "Aún no tienes vendedores. Crea el primero con el botón Nuevo."
              : "No hay vendedores dados de baja."}
          </li>
        ) : null}
      </ul>

      <Dialog
        open={formOpen}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next) setFormError("");
        }}
      >
        <DialogContent className="max-w-md overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar vendedor" : "Nuevo vendedor"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Deja la contraseña vacía para conservar la actual."
                : "El vendedor entrará con este correo y contraseña. Solo verá los leads que le asignes."}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={onSubmit}>
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre</Label>
              <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Correo</Label>
              <Input
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Teléfono (opcional)</Label>
              <Input value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{editing ? "Nueva contraseña" : "Contraseña"}</Label>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="Mínimo 6 caracteres"
                value={form.password}
                onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
              />
            </div>
            <Button type="submit" className="w-full" disabled={!canSubmit || saveMutation.isPending}>
              {saveMutation.isPending ? "Guardando..." : editing ? "Guardar cambios" : "Crear vendedor"}
            </Button>
            <FormErrorAlert title="No se pudo guardar el vendedor" message={formError} />
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deactivating)}
        onOpenChange={(next) => {
          if (!next) {
            setDeactivating(null);
            setDeactivateError("");
          }
        }}
      >
        <DialogContent className="max-w-md overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Dar de baja vendedor</DialogTitle>
            <DialogDescription>
              {deactivating?.name} dejará de poder entrar a la app y sus leads asignados quedarán sin asignar. Podrás
              reactivarlo después desde Inactivos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="w-full"
                disabled={deactivateMutation.isPending}
                onClick={() => setDeactivating(null)}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="w-full"
                disabled={deactivateMutation.isPending}
                onClick={() => deactivating && deactivateMutation.mutate(deactivating)}
              >
                {deactivateMutation.isPending ? "Procesando..." : "Dar de baja"}
              </Button>
            </div>
            <FormErrorAlert title="No se pudo dar de baja" message={deactivateError} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
