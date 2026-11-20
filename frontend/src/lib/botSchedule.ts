import type { BotScheduleRangeDto, BotWeeklyScheduleDto } from "@/services/crm";

export const SCHEDULE_DAYS = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miércoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
] as const;

export const ALL_DAY_RANGE: BotScheduleRangeDto = { start: "00:00", end: "23:59" };
export const DEFAULT_DAY_RANGE: BotScheduleRangeDto = { start: "08:00", end: "18:00" };

export const emptyWeeklySchedule = (): BotWeeklyScheduleDto => ({
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
});

const parseTime = (value: string) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

export const hasInvalidRanges = (schedule: BotWeeklyScheduleDto) => {
  return Object.values(schedule).some((ranges) =>
    ranges.some((range) => {
      const start = parseTime(range.start);
      const end = parseTime(range.end);
      return start === null || end === null || start >= end;
    })
  );
};
