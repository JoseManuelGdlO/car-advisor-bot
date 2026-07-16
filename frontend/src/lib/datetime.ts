import { normalizeTimezoneValue } from "@/lib/timezones";

const parseDate = (value: string | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getZonedDateParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
};

const getDaySerial = (value: string | Date, timeZone: string): number | null => {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return null;
  const { year, month, day } = getZonedDateParts(date, timeZone);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

export const getZonedDayKey = (value: string | undefined, timeZone?: string): string | null => {
  const date = parseDate(value);
  if (!date) return null;
  const { year, month, day } = getZonedDateParts(date, normalizeTimezoneValue(timeZone));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export const getZonedDayDifference = (
  value: string | undefined,
  timeZone?: string,
  reference = new Date(),
): number | null => {
  const normalizedTimeZone = normalizeTimezoneValue(timeZone);
  const valueDay = value ? getDaySerial(value, normalizedTimeZone) : null;
  const referenceDay = getDaySerial(reference, normalizedTimeZone);
  return valueDay === null || referenceDay === null ? null : referenceDay - valueDay;
};

export const formatChatDayLabel = (
  value: string | undefined,
  timeZone?: string,
  reference = new Date(),
): string => {
  const date = parseDate(value);
  if (!date) return "";
  const normalizedTimeZone = normalizeTimezoneValue(timeZone);
  const diffDays = getZonedDayDifference(value, normalizedTimeZone, reference);

  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays !== null && diffDays > 1 && diffDays < 7) {
    return new Intl.DateTimeFormat("es-MX", {
      timeZone: normalizedTimeZone,
      weekday: "long",
    }).format(date);
  }

  return new Intl.DateTimeFormat("es-MX", {
    timeZone: normalizedTimeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

export const formatMessageTime = (
  value: string | undefined,
  timeZone?: string,
  fallback = "",
): string => {
  const date = parseDate(value);
  if (!date) return fallback || value || "";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: normalizeTimezoneValue(timeZone),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

export const formatDateTime = (value: string | undefined, timeZone?: string): string => {
  const date = parseDate(value);
  if (!date) return value || "";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: normalizeTimezoneValue(timeZone),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};
