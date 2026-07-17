import { ApiError } from "./errors.js";

export const SCHEDULE_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
export const BOT_TONES = ["formal", "cercano", "vendedor", "tecnico"];
export const BOT_EMOJI_STYLES = ["nunca", "pocos", "frecuentes"];
export const BOT_SALES_PROACTIVITY = ["bajo", "medio", "alto"];
export const BOT_MESSAGE_MAX_LENGTH = 2000;
export const BOT_NAME_MAX_LENGTH = 40;

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
  const trimmed = timezone.trim();
  let canonical = trimmed;
  if (typeof Intl.supportedValuesOf === "function") {
    const match = Intl.supportedValuesOf("timeZone").find((tz) => tz.toLowerCase() === trimmed.toLowerCase());
    if (match) canonical = match;
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: canonical });
  } catch {
    throw new ApiError(400, "Invalid timezone");
  }
  return canonical;
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
  if (payload.tone !== undefined) {
    if (typeof payload.tone !== "string" || !BOT_TONES.includes(payload.tone)) {
      throw new ApiError(400, `tone must be one of: ${BOT_TONES.join(", ")}`);
    }
    next.tone = payload.tone;
  }
  if (payload.emojiStyle !== undefined) {
    if (typeof payload.emojiStyle !== "string" || !BOT_EMOJI_STYLES.includes(payload.emojiStyle)) {
      throw new ApiError(400, `emojiStyle must be one of: ${BOT_EMOJI_STYLES.join(", ")}`);
    }
    next.emojiStyle = payload.emojiStyle;
  }
  if (payload.salesProactivity !== undefined) {
    if (typeof payload.salesProactivity !== "string" || !BOT_SALES_PROACTIVITY.includes(payload.salesProactivity)) {
      throw new ApiError(400, `salesProactivity must be one of: ${BOT_SALES_PROACTIVITY.join(", ")}`);
    }
    next.salesProactivity = payload.salesProactivity;
  }
  if (payload.customInstructions !== undefined) {
    if (typeof payload.customInstructions !== "string") {
      throw new ApiError(400, "customInstructions must be a string");
    }
    const normalizedInstructions = payload.customInstructions.trim();
    if (normalizedInstructions.length > 1200) {
      throw new ApiError(400, "customInstructions max length is 1200");
    }
    next.customInstructions = normalizedInstructions;
  }
  if (payload.botName !== undefined) {
    if (typeof payload.botName !== "string") {
      throw new ApiError(400, "botName must be a string");
    }
    const normalizedBotName = payload.botName.trim();
    if (normalizedBotName.length > BOT_NAME_MAX_LENGTH) {
      throw new ApiError(400, `botName max length is ${BOT_NAME_MAX_LENGTH}`);
    }
    next.botName = normalizedBotName;
  }
  if (payload.welcomeMessage !== undefined) {
    if (typeof payload.welcomeMessage !== "string") {
      throw new ApiError(400, "welcomeMessage must be a string");
    }
    const normalizedWelcome = payload.welcomeMessage.trim();
    if (normalizedWelcome.length > BOT_MESSAGE_MAX_LENGTH) {
      throw new ApiError(400, `welcomeMessage max length is ${BOT_MESSAGE_MAX_LENGTH}`);
    }
    next.welcomeMessage = normalizedWelcome;
  }
  if (payload.faqFallbackMessage !== undefined) {
    if (typeof payload.faqFallbackMessage !== "string") {
      throw new ApiError(400, "faqFallbackMessage must be a string");
    }
    const normalizedFaqFallback = payload.faqFallbackMessage.trim();
    if (normalizedFaqFallback.length > BOT_MESSAGE_MAX_LENGTH) {
      throw new ApiError(400, `faqFallbackMessage max length is ${BOT_MESSAGE_MAX_LENGTH}`);
    }
    next.faqFallbackMessage = normalizedFaqFallback;
  }
  if (payload.downPaymentMessage !== undefined) {
    if (payload.downPaymentMessage !== null && typeof payload.downPaymentMessage !== "string") {
      throw new ApiError(400, "downPaymentMessage must be a string or null");
    }
    const normalizedDownPayment =
      payload.downPaymentMessage === null ? null : payload.downPaymentMessage.trim();
    if (normalizedDownPayment && normalizedDownPayment.length > BOT_MESSAGE_MAX_LENGTH) {
      throw new ApiError(400, `downPaymentMessage max length is ${BOT_MESSAGE_MAX_LENGTH}`);
    }
    next.downPaymentMessage = normalizedDownPayment || null;
  }
  if (payload.visitIncentiveMessage !== undefined) {
    if (payload.visitIncentiveMessage !== null && typeof payload.visitIncentiveMessage !== "string") {
      throw new ApiError(400, "visitIncentiveMessage must be a string or null");
    }
    const normalizedVisitIncentive =
      payload.visitIncentiveMessage === null ? null : payload.visitIncentiveMessage.trim();
    if (normalizedVisitIncentive && normalizedVisitIncentive.length > BOT_MESSAGE_MAX_LENGTH) {
      throw new ApiError(400, `visitIncentiveMessage max length is ${BOT_MESSAGE_MAX_LENGTH}`);
    }
    next.visitIncentiveMessage = normalizedVisitIncentive || null;
  }
  if (payload.reminderEnabled !== undefined) {
    if (typeof payload.reminderEnabled !== "boolean") {
      throw new ApiError(400, "reminderEnabled must be boolean");
    }
    next.reminderEnabled = payload.reminderEnabled;
  }
  if (payload.reminderMessage !== undefined) {
    if (payload.reminderMessage !== null && typeof payload.reminderMessage !== "string") {
      throw new ApiError(400, "reminderMessage must be a string or null");
    }
    const normalizedReminder =
      payload.reminderMessage === null ? null : payload.reminderMessage.trim();
    if (normalizedReminder && normalizedReminder.length > BOT_MESSAGE_MAX_LENGTH) {
      throw new ApiError(400, `reminderMessage max length is ${BOT_MESSAGE_MAX_LENGTH}`);
    }
    next.reminderMessage = normalizedReminder || null;
  }
  if (payload.reminderHours !== undefined) {
    if (payload.reminderHours !== null) {
      const hours = Number(payload.reminderHours);
      if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
        throw new ApiError(400, "reminderHours must be an integer between 1 and 720, or null");
      }
      next.reminderHours = hours;
    } else {
      next.reminderHours = null;
    }
  }
  if (payload.reminderOncePerConversation !== undefined) {
    if (typeof payload.reminderOncePerConversation !== "boolean") {
      throw new ApiError(400, "reminderOncePerConversation must be boolean");
    }
    next.reminderOncePerConversation = payload.reminderOncePerConversation;
  }
  return next;
};

export const toBotSettingsDto = (row) => ({
  isEnabled: Boolean(row?.isEnabled ?? true),
  timezone: validateTimezone(row?.timezone || "America/Bogota"),
  weeklySchedule: normalizeWeeklySchedule(row?.weeklySchedule),
  tone: BOT_TONES.includes(row?.tone) ? row.tone : "cercano",
  emojiStyle: BOT_EMOJI_STYLES.includes(row?.emojiStyle) ? row.emojiStyle : "pocos",
  salesProactivity: BOT_SALES_PROACTIVITY.includes(row?.salesProactivity) ? row.salesProactivity : "medio",
  customInstructions: typeof row?.customInstructions === "string" ? row.customInstructions : "",
  botName: typeof row?.botName === "string" ? row.botName : "",
  welcomeMessage: typeof row?.welcomeMessage === "string" ? row.welcomeMessage : "",
  faqFallbackMessage: typeof row?.faqFallbackMessage === "string" ? row.faqFallbackMessage : "",
  downPaymentMessage:
    typeof row?.downPaymentMessage === "string" && row.downPaymentMessage.trim()
      ? row.downPaymentMessage
      : null,
  visitIncentiveMessage:
    typeof row?.visitIncentiveMessage === "string" && row.visitIncentiveMessage.trim()
      ? row.visitIncentiveMessage
      : null,
  reminderEnabled: Boolean(row?.reminderEnabled ?? false),
  reminderMessage:
    typeof row?.reminderMessage === "string" && row.reminderMessage.trim()
      ? row.reminderMessage
      : null,
  reminderHours: (() => {
    const hours = Number(row?.reminderHours);
    return Number.isInteger(hours) && hours >= 1 && hours <= 720 ? hours : null;
  })(),
  reminderOncePerConversation: Boolean(row?.reminderOncePerConversation ?? false),
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
