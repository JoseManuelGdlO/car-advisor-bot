export const STATUS_BADGE_LABELS = {
  PENDING: "En revisión",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  PAUSED: "Pausada",
  DISABLED: "Pausada",
} as const;

export const META_TEMPLATE_PENDING_EDIT_HINT =
  "No se puede editar una plantilla en revisión";

export const META_RESUBMIT_TITLE =
  "¿Seguro que quieres mandar esta plantilla a revisión?";
export const META_RESUBMIT_WARNING =
  "Quedará deshabilitada para los recordatorios de WhatsApp hasta que Meta la apruebe otra vez. Suele tardar alrededor de un día.";

export const META_FOLLOWUP_DEFAULT_BODY =
  "Hola, te escribimos de nuevo por si sigues interesado en nuestros vehículos. ¿Te puedo ayudar con algo más?";

export function shouldConfirmMetaResubmit(status: string | null | undefined) {
  return status === "APPROVED" || status === "REJECTED" || status === "PAUSED" || status === "DISABLED";
}

export function followupBodyError(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return "El cuerpo no puede estar vacío.";
  if (body.length > 1024) return "El cuerpo no puede superar 1024 caracteres.";
  if (/\{\{\d+\}\}/.test(trimmed)) return "Esta plantilla es solo texto. No uses variables como {{1}}.";
  return null;
}

export function statusBadgeClassName(status: string | null | undefined) {
  switch (status) {
    case "APPROVED":
      return "border-transparent bg-emerald-100 text-emerald-800";
    case "REJECTED":
      return "border-transparent bg-destructive text-destructive-foreground";
    case "PENDING":
      return "border-transparent bg-amber-100 text-amber-900";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function metaTemplateStatusHint(status: string | null | undefined): string | null {
  switch (status) {
    case "PENDING":
      return "En revisión de Meta. No se puede usar en recordatorios fuera de 24 h hasta que la aprueben.";
    case "APPROVED":
      return "Aprobada. Lista para recordatorios de WhatsApp fuera de la ventana de 24 h.";
    case "REJECTED":
      return "Meta la rechazó. Edítala y vuelve a enviarla a revisión.";
    case "PAUSED":
    case "DISABLED":
      return "Pausada. No se usa en envíos hasta que vuelva a estar aprobada.";
    default:
      return null;
  }
}
