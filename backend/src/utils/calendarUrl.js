import { z } from "zod";

const GOOGLE_CALENDAR_HOSTS = new Set(["calendar.app.google", "calendar.google.com"]);

export const DEFAULT_CALENDAR_SCHEDULING_URL = "https://calendar.app.google/tYniJNfcrd8qXvut8";

export const isGoogleCalendarSchedulingUrl = (value) => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" && GOOGLE_CALENDAR_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
};

export const calendarSchedulingUrlSchema = z
  .string()
  .trim()
  .min(1, "El link de calendario es obligatorio.")
  .max(500, "El link de calendario es demasiado largo.")
  .refine(isGoogleCalendarSchedulingUrl, {
    message: "Debe ser un enlace https de Google Calendar (calendar.app.google o calendar.google.com).",
  });
