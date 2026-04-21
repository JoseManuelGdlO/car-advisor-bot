import { ApiError } from "./errors.js";

export const SCHEDULE_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const DAY_INDEX_BY_NAME = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 0,
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const parseMinutes = (value) => {
  if (typeof value !== "string") return null;
  const match = TIME_RE.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const normalizeDayRanges = (ranges, day) => {
  if (!Array.isArray(ranges)) {
    throw new ApiError(400, `Invalid schedule: ${day} must be an array`);
  }
  if (ranges.length > 6) {
    throw new ApiError(400, `Invalid schedule: ${day} supports up to 6 ranges`);
  }
  const parsed = ranges.map((range, idx) => {
    if (!range || typeof range !== "object") {
      throw new ApiError(400, `Invalid schedule: ${day}[${idx}] must be an object`);
    }
    const start = parseMinutes(range.start);
    const end = parseMinutes(range.end);
    if (start === null || end === null) {
      throw new ApiError(400, `Invalid schedule: ${day}[${idx}] start/end must be HH:mm`);
    }
    if (start >= end) {
      throw new ApiError(400, `Invalid schedule: ${day}[${idx}] start must be before end`);
    }
    return { start: range.start, end: range.end, startMinutes: start, endMinutes: end };
  });

  parsed.sort((a, b) => a.startMinutes - b.startMinutes);
  for (let i = 1; i < parsed.length; i += 1) {
    if (parsed[i].startMinutes < parsed[i - 1].endMinutes) {
      throw new ApiError(400, `Invalid schedule: ${day} has overlapping ranges`);
    }
  }
  return parsed.map(({ start, end }) => ({ start, end }));
};

export const normalizeWeeklySchedule = (input) => {
  if (input === undefined || input === null) {
    return Object.fromEntries(SCHEDULE_DAYS.map((day) => [day, []]));
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "Invalid schedule: weeklySchedule must be an object");
  }

  const normalized = {};
  for (const day of SCHEDULE_DAYS) {
    normalized[day] = normalizeDayRanges(input[day] || [], day);
  }
  return normalized;
};

export const validateTimezone = (timezone) => {
  if (typeof timezone !== "string" || !timezone.trim()) {
    throw new ApiError(400, "Invalid timezone");
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new ApiError(400, "Invalid timezone");
  }
  return timezone;
};

export const normalizeBotSettingsPayload = (payload) => {
  const next = {};
  if (payload.isEnabled !== undefined) {
    if (typeof payload.isEnabled !== "boolean") throw new ApiError(400, "isEnabled must be boolean");
    next.isEnabled = payload.isEnabled;
  }
  if (payload.timezone !== undefined) {
    next.timezone = validateTimezone(payload.timezone);
  }
  if (payload.weeklySchedule !== undefined) {
    next.weeklySchedule = normalizeWeeklySchedule(payload.weeklySchedule);
  }
  return next;
};

export const toBotSettingsDto = (row) => ({
  isEnabled: Boolean(row?.isEnabled ?? true),
  timezone: row?.timezone || "America/Bogota",
  weeklySchedule: normalizeWeeklySchedule(row?.weeklySchedule),
});

const getNowParts = (timezone, date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const weekdayRaw = parts.find((part) => part.type === "weekday")?.value?.toLowerCase() || "monday";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return { weekdayRaw, minutes: hour * 60 + minute };
};

export const isWithinBotSchedule = (settings, date = new Date()) => {
  if (!settings?.isEnabled) return false;
  const timezone = settings.timezone || "America/Bogota";
  const weeklySchedule = normalizeWeeklySchedule(settings.weeklySchedule);
  const { weekdayRaw, minutes } = getNowParts(timezone, date);
  const day = SCHEDULE_DAYS.includes(weekdayRaw) ? weekdayRaw : Object.keys(DAY_INDEX_BY_NAME).find((key) => key === weekdayRaw) || "monday";
  const ranges = weeklySchedule[day] || [];
  if (!ranges.length) return false;
  return ranges.some((range) => {
    const start = parseMinutes(range.start);
    const end = parseMinutes(range.end);
    return start !== null && end !== null && minutes >= start && minutes < end;
  });
};
