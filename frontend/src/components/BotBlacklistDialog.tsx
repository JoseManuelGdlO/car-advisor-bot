import { FormEvent, useMemo, useState, type ReactNode } from "react";
import { Ban, Plus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { useAuth } from "@/context/AuthContext";
import { normalizeApiError } from "@/lib/formErrors";
import { MEXICO_WHATSAPP_MAX_DIGITS, normalizeBlacklistPhone } from "@/lib/phone";
import { crmApi, type BlacklistEntryDto } from "@/services/crm";

type BotBlacklistDialogProps = {
  children: ReactNode;
};

export function BotBlacklistDialog({ children }: BotBlacklistDialogProps) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: entries = [] } = useQuery({
    queryKey: ["phone-blacklist"],
    queryFn: () => crmApi.getBlacklist(token!),
    enabled: Boolean(token),
  }) as { data: BlacklistEntryDto[] };

  const countLabel = useMemo(() => {
    if (entries.length === 1) return "1 número bloqueado";
    return `${entries.length} números bloqueados`;
  }, [entries.length]);

  const resetErrors = () => {
    setCreateError("");
    setDeleteError("");
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    const digits = phone.replace(/\D/g, "");
    if (digits.length > MEXICO_WHATSAPP_MAX_DIGITS) {
      setCreateError("El teléfono no puede tener más de 13 dígitos.");
      return;
    }

    const normalizedPhone = normalizeBlacklistPhone(phone);
    if (!normalizedPhone) {
      setCreateError("Introduce un teléfono válido de 10 dígitos o con prefijo 521.");
      return;
    }

    setSaving(true);
    setCreateError("");
    try {
      await crmApi.addBlacklistPhone(token, { phone: normalizedPhone });
      await queryClient.invalidateQueries({ queryKey: ["phone-blacklist"] });
      setPhone("");
    } catch (err) {
      setCreateError(normalizeApiError(err, "No se pudo agregar el teléfono.").formError);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!token) return;

    setDeletingId(id);
    setDeleteError("");
    try {
      await crmApi.removeBlacklistPhone(token, id);
      await queryClient.invalidateQueries({ queryKey: ["phone-blacklist"] });
    } catch (err) {
      setDeleteError(normalizeApiError(err, "No se pudo quitar el teléfono.").formError);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetErrors();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="max-w-md overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Lista negra de teléfonos</DialogTitle>
          <DialogDescription>Agrega o elimina números de WhatsApp que el bot debe ignorar.</DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="flex gap-2">
            <Input
              placeholder="Ej. 618XXXXXXX o 521618XXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
            />
            <Button type="submit" disabled={saving || !phone.trim()}>
              <Plus className="w-4 h-4 mr-1" />
              {saving ? "Agregando..." : "Agregar"}
            </Button>
          </div>
          <FormErrorAlert title="No se pudo agregar el teléfono" message={createError} />
        </form>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Números bloqueados</p>
            <p className="text-xs text-muted-foreground">{countLabel}</p>
          </div>

          {entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-4 text-xs text-muted-foreground flex items-center gap-2">
              <Ban className="w-4 h-4 shrink-0" />
              No hay teléfonos en la lista negra.
            </div>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-all">{entry.phone}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label={`Eliminar ${entry.phone}`}
                    disabled={deletingId === entry.id}
                    onClick={() => onDelete(entry.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <FormErrorAlert title="No se pudo quitar el teléfono" message={deleteError} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
