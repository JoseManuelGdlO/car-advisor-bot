export const MEXICO_WHATSAPP_PREFIX = "521";
export const MEXICO_WHATSAPP_MAX_DIGITS = 13;

export function normalizePhoneDigits(phone: string | undefined): string {
  return String(phone || "").replace(/\D/g, "");
}

/** Normaliza teléfonos MX de WhatsApp a 13 dígitos con prefijo 521. */
export function normalizeBlacklistPhone(value: string): string | null {
  const compact = value.trim().replace(/\s/g, "");
  if (!compact) return null;

  let digits = compact.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > MEXICO_WHATSAPP_MAX_DIGITS) return null;

  if (digits.length === 10) {
    digits = `${MEXICO_WHATSAPP_PREFIX}${digits}`;
  } else if (digits.length === 12 && digits.startsWith("52")) {
    digits = `${MEXICO_WHATSAPP_PREFIX}${digits.slice(2)}`;
  }

  if (digits.length === MEXICO_WHATSAPP_MAX_DIGITS && digits.startsWith(MEXICO_WHATSAPP_PREFIX)) {
    return digits;
  }

  return null;
}

export function resolveClientDisplayPhone(client?: { displayPhone?: string | null; phone?: string }): string {
  return String(client?.displayPhone || "").trim();
}

export function buildTelHref(phone: string | undefined): string | null {
  if (!phone?.trim()) return null;
  const compact = phone.replace(/\s/g, "");
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 7) return null;
  const intl = compact.startsWith("+") ? `+${digits}` : digits;
  return `tel:${intl}`;
}
