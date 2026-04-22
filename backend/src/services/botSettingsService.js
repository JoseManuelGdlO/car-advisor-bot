import { BotSetting } from "../models/index.js";
import { normalizeWeeklySchedule } from "../utils/botSettings.js";

export const DEFAULT_BOT_SETTINGS = {
  isEnabled: true,
  timezone: "America/Bogota",
  weeklySchedule: normalizeWeeklySchedule({
    monday: [{ start: "08:00", end: "18:00" }],
    tuesday: [{ start: "08:00", end: "18:00" }],
    wednesday: [{ start: "08:00", end: "18:00" }],
    thursday: [{ start: "08:00", end: "18:00" }],
    friday: [{ start: "08:00", end: "18:00" }],
    saturday: [],
    sunday: [],
  }),
};

export const getOrCreateBotSettings = async (ownerUserId) => {
  const [row] = await BotSetting.findOrCreate({
    where: { ownerUserId },
    defaults: { ownerUserId, ...DEFAULT_BOT_SETTINGS },
  });
  return row;
};
