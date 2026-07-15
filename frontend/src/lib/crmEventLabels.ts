/** Mapea slugs CRM históricos a texto legible en la lista de conversaciones. */
const CRM_EVENT_PREVIEW_LABELS: Record<string, string> = {
  financing_detail_escalation: "Cliente necesita ayuda con financiamiento",
  human_advisor_requested: "Cliente pidió hablar con un asesor",
  lead_capture_completed: "Se envió el enlace para agendar visita o prueba de manejo",
};

export function formatConversationPreview(lastMessage?: string | null): string {
  const raw = String(lastMessage || "").trim();
  if (!raw) return "";
  return CRM_EVENT_PREVIEW_LABELS[raw] || raw;
}
