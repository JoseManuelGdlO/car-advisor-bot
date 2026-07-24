/** Marcador de mensaje CRM enriquecido con datos de campaña CTWA. */
export const CAMPAIGN_CRM_MARKER = "📢 Campaña CTWA";

/** Prefijo cuando solo hay señal CTWA sin title/body. */
export const CAMPAIGN_CRM_FALLBACK_PREFIX = "📢 Entró desde campaña";

const asTrimmed = (value) => {
  const text = String(value ?? "").trim();
  return text || "";
};

/** Etiqueta legible de sourceApp (facebook → Facebook). */
export const formatCampaignSourceLabel = (sourceApp) => {
  const raw = asTrimmed(sourceApp).toLowerCase();
  if (!raw) return "";
  if (raw === "facebook" || raw === "fb" || raw === "fb_ads" || raw === "facebook_ads") {
    return "Facebook";
  }
  if (raw === "instagram" || raw === "ig" || raw === "ig_ads") {
    return "Instagram";
  }
  return asTrimmed(sourceApp).replace(/_/g, " ");
};

/**
 * Arma el texto CRM del mensaje del cliente incluyendo datos de la campaña.
 * No debe usarse como `message` hacia el bot (el matching usa ad_context aparte).
 *
 * @param {string} clientMessage
 * @param {unknown} adContext
 * @returns {string}
 */
export const formatCampaignCrmMessage = (clientMessage, adContext) => {
  const base = asTrimmed(clientMessage);
  if (!adContext || typeof adContext !== "object" || adContext.isAd !== true) {
    return base;
  }

  const title = asTrimmed(adContext.title);
  const body = asTrimmed(adContext.body);
  const sourceUrl = asTrimmed(adContext.sourceUrl);
  const sourceLabel = formatCampaignSourceLabel(adContext.sourceApp);

  if (!title && !body) {
    const fallback = sourceLabel
      ? `${CAMPAIGN_CRM_FALLBACK_PREFIX} (${sourceLabel})`
      : `${CAMPAIGN_CRM_FALLBACK_PREFIX}`;
    return base ? `${base}\n\n${fallback}` : fallback;
  }

  const lines = [CAMPAIGN_CRM_MARKER];
  if (title) lines.push(`Título: ${title}`);
  if (sourceLabel) lines.push(`Origen: ${sourceLabel}`);
  if (sourceUrl) lines.push(sourceUrl);
  if (body) {
    lines.push("");
    lines.push(body);
  }

  const campaignBlock = lines.join("\n");
  return base ? `${base}\n\n${campaignBlock}` : campaignBlock;
};
