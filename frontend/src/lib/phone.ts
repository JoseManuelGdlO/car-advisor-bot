export function normalizePhoneDigits(phone: string | undefined): string {
  return String(phone || "").replace(/\D/g, "");
}

export function buildTelHref(phone: string | undefined): string | null {
  if (!phone?.trim()) return null;
  const compact = phone.replace(/\s/g, "");
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 7) return null;
  const intl = compact.startsWith("+") ? `+${digits}` : digits;
  return `tel:${intl}`;
}
