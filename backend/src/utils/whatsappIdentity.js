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

export const normalizeDisplayPhone = (value) => {
  const compact = String(value || "").trim().replace(/\s/g, "");
  if (!compact || isWhatsappChannelId(compact)) return null;
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return compact.startsWith("+") ? `+${digits}` : digits;
};

export const resolveDisplayPhone = ({ fromPhone, channelId, customerTelefono } = {}) => {
  const fromPhoneNorm = normalizeDisplayPhone(fromPhone);
  if (fromPhoneNorm) return fromPhoneNorm;

  const customerNorm = normalizeDisplayPhone(customerTelefono);
  if (customerNorm) return customerNorm;

  return extractDisplayPhoneFromChannelId(channelId);
};
