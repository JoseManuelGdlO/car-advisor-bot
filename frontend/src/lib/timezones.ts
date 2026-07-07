export type TimezoneOption = {
  value: string;
  label: string;
};

export const DEFAULT_BOT_TIMEZONE = "America/Bogota";

export const BOT_TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: "America/Mexico_City", label: "Ciudad de México" },
  { value: "America/Cancun", label: "Cancún" },
  { value: "America/Monterrey", label: "Monterrey" },
  { value: "America/Tijuana", label: "Tijuana" },
  { value: "America/Bogota", label: "Bogotá" },
  { value: "America/Lima", label: "Lima" },
  { value: "America/Santiago", label: "Santiago" },
  { value: "America/Buenos_Aires", label: "Buenos Aires" },
  { value: "America/Sao_Paulo", label: "São Paulo" },
  { value: "America/Caracas", label: "Caracas" },
  { value: "America/Guayaquil", label: "Guayaquil" },
  { value: "America/La_Paz", label: "La Paz" },
  { value: "America/Asuncion", label: "Asunción" },
  { value: "America/Montevideo", label: "Montevideo" },
  { value: "America/Panama", label: "Panamá" },
  { value: "America/Costa_Rica", label: "Costa Rica" },
  { value: "America/Guatemala", label: "Guatemala" },
  { value: "America/El_Salvador", label: "El Salvador" },
  { value: "America/Tegucigalpa", label: "Honduras" },
  { value: "America/Managua", label: "Nicaragua" },
  { value: "America/Havana", label: "La Habana" },
  { value: "America/Puerto_Rico", label: "Puerto Rico" },
  { value: "America/New_York", label: "Nueva York (Este)" },
  { value: "America/Chicago", label: "Chicago (Centro)" },
  { value: "America/Denver", label: "Denver (Montaña)" },
  { value: "America/Los_Angeles", label: "Los Ángeles (Pacífico)" },
  { value: "UTC", label: "UTC" },
];

const findTimezoneOption = (timezone: string) =>
  BOT_TIMEZONE_OPTIONS.find((option) => option.value.toLowerCase() === timezone.toLowerCase());

/** Resuelve el ID IANA canónico de la lista o valida uno externo con Intl. */
export const normalizeTimezoneValue = (timezone?: string): string => {
  const trimmed = timezone?.trim();
  if (!trimmed) return DEFAULT_BOT_TIMEZONE;

  const known = findTimezoneOption(trimmed);
  if (known) return known.value;

  try {
    Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return trimmed;
  } catch {
    return DEFAULT_BOT_TIMEZONE;
  }
};

export const getTimezoneLabel = (timezone?: string): string => {
  const canonical = normalizeTimezoneValue(timezone);
  return findTimezoneOption(canonical)?.label ?? canonical;
};

export const resolveTimezoneOptions = (current?: string): TimezoneOption[] => {
  const canonical = normalizeTimezoneValue(current);
  if (findTimezoneOption(canonical)) {
    return BOT_TIMEZONE_OPTIONS;
  }
  return [{ value: canonical, label: canonical }, ...BOT_TIMEZONE_OPTIONS];
};
