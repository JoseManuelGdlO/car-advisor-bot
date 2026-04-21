import type { BotWeeklyScheduleDto } from "@/services/crm";

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
