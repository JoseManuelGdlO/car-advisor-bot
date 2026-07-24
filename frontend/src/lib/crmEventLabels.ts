/** Mapea slugs CRM históricos a texto legible en la lista de conversaciones. */
const CRM_EVENT_PREVIEW_LABELS: Record<string, string> = {
  financing_detail_escalation: "Cliente necesita ayuda con financiamiento",
  human_advisor_requested: "Cliente pidió hablar con un asesor",
  lead_capture_completed: "Se envió el enlace para agendar visita o prueba de manejo",
};

const CAMPAIGN_CRM_MARKER = "📢 Campaña CTWA";
const CAMPAIGN_CRM_FALLBACK_PREFIX = "📢 Entró desde campaña";
const LIST_PREVIEW_MAX_LEN = 120;
const BODY_PREVIEW_MAX_LEN = 80;

type FormatConversationPreviewOptions = {
  /** Compacta mensajes de campaña CTWA (omite/trunca body) para la lista. */
  compactCampaign?: boolean;
};

function truncateOneLine(text: string, maxLen: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

/** Resume mensajes CRM enriquecidos con bloque de campaña para la lista de conversaciones. */
function compactCampaignPreview(raw: string): string {
  const markerIdx = raw.indexOf(CAMPAIGN_CRM_MARKER);
  const fallbackIdx = raw.indexOf(CAMPAIGN_CRM_FALLBACK_PREFIX);

  if (markerIdx < 0 && fallbackIdx < 0) return raw;

  if (fallbackIdx >= 0 && (markerIdx < 0 || fallbackIdx < markerIdx)) {
    const clientPart = raw.slice(0, fallbackIdx).trim();
    const fallbackLine =
      raw
        .slice(fallbackIdx)
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean) || CAMPAIGN_CRM_FALLBACK_PREFIX;
    const combined = clientPart ? `${clientPart} · ${fallbackLine}` : fallbackLine;
    return truncateOneLine(combined, LIST_PREVIEW_MAX_LEN);
  }

  const clientPart = raw.slice(0, markerIdx).trim();
  const campaignBlock = raw.slice(markerIdx);
  const lines = campaignBlock
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const titleLine = lines.find((line) => line.startsWith("Título:"));
  const title = titleLine ? titleLine.replace(/^Título:\s*/i, "").trim() : "";
  const bodyStart = lines.findIndex((line) => line === CAMPAIGN_CRM_MARKER);
  const afterMeta = lines.slice(bodyStart + 1).filter((line) => {
    if (line.startsWith("Título:")) return false;
    if (line.startsWith("Origen:")) return false;
    if (/^https?:\/\//i.test(line)) return false;
    return true;
  });
  const body = afterMeta.join(" ").trim();

  const parts: string[] = [];
  if (clientPart) parts.push(clientPart);
  if (title) {
    parts.push(`📢 ${title}`);
  } else {
    parts.push(CAMPAIGN_CRM_MARKER);
  }
  if (body) {
    parts.push(truncateOneLine(body, BODY_PREVIEW_MAX_LEN));
  }

  return truncateOneLine(parts.join(" · "), LIST_PREVIEW_MAX_LEN);
}

export function formatConversationPreview(
  lastMessage?: string | null,
  options?: FormatConversationPreviewOptions,
): string {
  const raw = String(lastMessage || "").trim();
  if (!raw) return "";
  const labeled = CRM_EVENT_PREVIEW_LABELS[raw] || raw;
  if (options?.compactCampaign) {
    return compactCampaignPreview(labeled);
  }
  return labeled;
}
