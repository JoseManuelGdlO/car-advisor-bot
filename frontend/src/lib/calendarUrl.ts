const GOOGLE_CALENDAR_HOSTS = new Set(["calendar.app.google", "calendar.google.com"]);

export function isGoogleCalendarSchedulingUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" && GOOGLE_CALENDAR_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export const GOOGLE_CALENDAR_URL_ERROR =
  "Debe ser un enlace https de Google Calendar (calendar.app.google o calendar.google.com).";
