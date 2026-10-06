import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { normalizeApiError } from "@/lib/formErrors";
import {
  followupBodyError,
  META_FOLLOWUP_DEFAULT_BODY,
  META_RESUBMIT_TITLE,
  META_RESUBMIT_WARNING,
  META_TEMPLATE_PENDING_EDIT_HINT,
  metaTemplateStatusHint,
  shouldConfirmMetaResubmit,
  STATUS_BADGE_LABELS,
  statusBadgeClassName,
} from "@/lib/whatsapp-followup-template";
import { integrationsApi, type FollowupTemplateDto } from "@/services/integrations";

type BotFollowupTemplateSectionProps = {
  token: string | null;
  reminderEnabled: boolean;
  reminderMessage: string;
  onReminderMessageChange: (value: string) => void;
  reminderMessageMissing: boolean;
  reminderFieldsDisabled: boolean;
  settingsHydrated: boolean;
};

function badgeLabel(status: FollowupTemplateDto["status"]) {
  return STATUS_BADGE_LABELS[status];
}

export function BotFollowupTemplateSection({
  token,
  reminderEnabled,
  reminderMessage,
  onReminderMessageChange,
  reminderMessageMissing,
  reminderFieldsDisabled,
  settingsHydrated,
}: BotFollowupTemplateSectionProps) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-followup-template"],
    queryFn: () => integrationsApi.getFollowupTemplate(token!),
    enabled: Boolean(token),
  });

  const metaConnected = Boolean(data?.metaConnected);
  const template = data?.template ?? null;
  const pendingEdit = template?.status === "PENDING";

  const [metaBody, setMetaBody] = useState("");
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (template) {
      const seedKey = `${template.id}:${template.body}`;
      if (seededFrom !== seedKey) {
        setMetaBody(template.body);
        setSeededFrom(seedKey);
      }
      return;
    }
    if (!metaConnected || !settingsHydrated || seededFrom === "create") return;
    setMetaBody(reminderMessage.trim() || META_FOLLOWUP_DEFAULT_BODY);
    setSeededFrom("create");
  }, [metaConnected, reminderMessage, seededFrom, settingsHydrated, template]);

  const createMutation = useMutation({
    mutationFn: (body: string) => integrationsApi.createFollowupTemplate(token!, { body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-followup-template"] });
      toast.success("Plantilla enviada a revisión");
    },
    onError: (error: unknown) => {
      toast.error(normalizeApiError(error, error instanceof Error ? error.message : "No se pudo crear la plantilla.").formError);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (body: string) => integrationsApi.updateFollowupTemplate(token!, { body }),
    onSuccess: async () => {
      setConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-followup-template"] });
      toast.success("Plantilla enviada a revisión");
    },
    onError: (error: unknown) => {
      toast.error(normalizeApiError(error, error instanceof Error ? error.message : "No se pudo actualizar la plantilla.").formError);
    },
  });

  const saving = createMutation.isPending || updateMutation.isPending;
  const bodyError = metaConnected ? followupBodyError(metaBody) : null;
  const metaTextareaDisabled = isLoading || !token || pendingEdit || saving;
  const submitDisabled = metaTextareaDisabled || Boolean(bodyError);

  const submitUpdate = () => {
    if (bodyError || pendingEdit || !token) return;
    updateMutation.mutate(metaBody.trim());
  };

  const onSaveClick = () => {
    if (bodyError || pendingEdit || !token) return;
    if (shouldConfirmMetaResubmit(template?.status)) {
      setConfirmOpen(true);
      return;
    }
    submitUpdate();
  };

  const statusHint = template ? metaTemplateStatusHint(template.status) : null;
  const showUnapprovedNotice =
    reminderEnabled && metaConnected && template?.status !== "APPROVED";

  return (
    <div className="space-y-3">
      {!isLoading && data && !metaConnected ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950" role="status">
          Conecta WhatsApp en Perfil para usar una plantilla de seguimiento fuera de 24 h.
        </p>
      ) : null}

      {showUnapprovedNotice ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950" role="status">
          Fuera de 24 h el recordatorio de WhatsApp no se enviará hasta que Meta apruebe la plantilla.
        </p>
      ) : null}

      {template ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge className={statusBadgeClassName(template.status)}>{badgeLabel(template.status)}</Badge>
          </div>
          {statusHint ? <p className="text-xs text-muted-foreground">{statusHint}</p> : null}
          {template.status === "REJECTED" && template.rejectedReason ? (
            <p className="text-xs text-destructive">{template.rejectedReason}</p>
          ) : null}
        </div>
      ) : null}

      {metaConnected ? (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground" htmlFor="bot-followup-template-body">
            Cuerpo de la plantilla
          </label>
          <Textarea
            id="bot-followup-template-body"
            rows={3}
            value={metaBody}
            onChange={(e) => setMetaBody(e.target.value)}
            placeholder={META_FOLLOWUP_DEFAULT_BODY}
            disabled={metaTextareaDisabled}
            maxLength={1024}
            aria-invalid={Boolean(bodyError)}
          />
          {pendingEdit ? (
            <p className="text-xs text-muted-foreground">{META_TEMPLATE_PENDING_EDIT_HINT}</p>
          ) : bodyError ? (
            <p className="text-xs text-destructive">{bodyError}</p>
          ) : null}
          <p className="text-[11px] text-muted-foreground text-right">{metaBody.length}/1024</p>
          {template ? (
            <Button type="button" className="w-full" disabled={submitDisabled} onClick={onSaveClick}>
              {updateMutation.isPending ? "Enviando..." : "Guardar y enviar a revisión"}
            </Button>
          ) : (
            <Button
              type="button"
              className="w-full"
              disabled={submitDisabled}
              onClick={() => {
                if (bodyError || !token) return;
                createMutation.mutate(metaBody.trim());
              }}
            >
              {createMutation.isPending ? "Enviando..." : "Crear plantilla de seguimiento"}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground" htmlFor="bot-reminder-message">
            Mensaje de recordatorio
          </label>
          <Textarea
            id="bot-reminder-message"
            rows={3}
            value={reminderMessage}
            onChange={(e) => onReminderMessageChange(e.target.value)}
            placeholder="Ej. ¿Sigues interesado? Estoy aquí para ayudarte."
            disabled={reminderFieldsDisabled}
            maxLength={2000}
            aria-invalid={reminderMessageMissing}
          />
          {reminderMessageMissing ? (
            <p className="text-xs text-destructive">Escribe el mensaje de recordatorio para poder activarlo.</p>
          ) : null}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !updateMutation.isPending && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{META_RESUBMIT_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>{META_RESUBMIT_WARNING}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={updateMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                submitUpdate();
              }}
            >
              {updateMutation.isPending ? "Enviando..." : "Enviar a revisión"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
