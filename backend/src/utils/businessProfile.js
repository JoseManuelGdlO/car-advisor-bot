/** DTO del perfil comercial para API (cuenta / frontend). */

export const toBusinessProfileDto = (row) => {
  if (!row) return null;
  return {
    tradeName: row.tradeName ?? null,
    legalName: row.legalName ?? null,
    taxId: row.taxId ?? null,
    businessPhone: row.businessPhone ?? null,
    businessEmail: row.businessEmail ?? null,
    website: row.website ?? null,
    addressLine: row.addressLine ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    country: row.country ?? null,
    description: row.description ?? null,
    logoUrl: row.logoUrl ?? null,
  };
};

/** Subconjunto del perfil expuesto al bot (sin datos fiscales/legales internos). */

export const toBusinessProfileBotDto = (row) => {
  const full = toBusinessProfileDto(row);
  if (!full) return null;
  const { legalName: _legalName, taxId: _taxId, ...botSafe } = full;
  return botSafe;
};
