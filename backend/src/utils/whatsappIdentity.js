const CHANNEL_ID_SUFFIX_RE = /@(lid|s\.whatsapp\.net|g\.us)$/i;

export const isWhatsappChannelId = (value) => {
  const v = String(value || "").trim();
  if (!v) return false;
  return CHANNEL_ID_SUFFIX_RE.test(v);
};

export const extractDisplayPhoneFromChannelId = (value) => {
  const v = String(value || "").trim();
  if (!v) return null;
  if (/@lid$/i.test(v) || /@g\.us$/i.test(v)) return null;
  if (/@s\.whatsapp\.net$/i.test(v)) {
    return normalizeDisplayPhone(v.replace(/@s\.whatsapp\.net$/i, ""));
  }
  return null;
};

export const MEXICO_WHATSAPP_PREFIX = "521";
export const MEXICO_WHATSAPP_MAX_DIGITS = 13;

export const normalizeDisplayPhone = (value) => {
  const compact = String(value || "").trim().replace(/\s/g, "");
  if (!compact || isWhatsappChannelId(compact)) return null;
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return compact.startsWith("+") ? `+${digits}` : digits;
};

/** Normaliza teléfonos MX de WhatsApp a 13 dígitos con prefijo 521 para blacklist. */
export const normalizeBlacklistPhone = (value) => {
  const compact = String(value || "").trim().replace(/\s/g, "");
  if (!compact || isWhatsappChannelId(compact)) return null;

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
};

export const blacklistPhoneLookupValues = (normalizedPhone) => {
  if (!normalizedPhone) return [];
  const values = [normalizedPhone];
  if (normalizedPhone.startsWith(MEXICO_WHATSAPP_PREFIX) && normalizedPhone.length === MEXICO_WHATSAPP_MAX_DIGITS) {
    values.push(normalizedPhone.slice(MEXICO_WHATSAPP_PREFIX.length));
  }
  return [...new Set(values)];
};

/**
 * Destinatario Graph: dígitos E.164 (10–15), sin `+` ni `@s.whatsapp.net`.
 * México va como `52` + 10 dígitos. El `521` legado del webhook se convierte a `52`.
 */
export const formatWhatsappGraphTo = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return "";
  if (digits.length === 10) return `52${digits}`;
  if (digits.length === 13 && digits.startsWith("521")) return `52${digits.slice(3)}`;
  return digits;
};

export const resolveDisplayPhone = ({ fromPhone, channelId, customerTelefono } = {}) => {
  const fromPhoneNorm = normalizeDisplayPhone(fromPhone);
  if (fromPhoneNorm) return fromPhoneNorm;

  const customerNorm = normalizeDisplayPhone(customerTelefono);
  if (customerNorm) return customerNorm;

  return extractDisplayPhoneFromChannelId(channelId);
};
