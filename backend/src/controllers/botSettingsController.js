import { BusinessProfile, User } from "../models/index.js";
import { normalizeBotSettingsPayload, toBotSettingsDto } from "../utils/botSettings.js";
import { toBusinessProfileBotDto } from "../utils/businessProfile.js";
import { getOrCreateBotSettings } from "../services/botSettingsService.js";
import { resolveRequestOwner } from "../utils/resolveRequestOwner.js";
import { DEFAULT_CALENDAR_SCHEDULING_URL } from "../utils/calendarUrl.js";

const buildBotSettingsResponse = async (row, ownerUserId) => {
  const user = await User.findByPk(ownerUserId, { attributes: ["calendarSchedulingUrl"] });
  const [business] = await BusinessProfile.findOrCreate({
    where: { ownerUserId },
    defaults: { ownerUserId },
  });
  return {
    ...toBotSettingsDto(row),
    calendarSchedulingUrl: user?.calendarSchedulingUrl || DEFAULT_CALENDAR_SCHEDULING_URL,
    businessProfile: toBusinessProfileBotDto(business),
  };
};

export const getBotSettings = async (req, res) => {
  // Obtiene configuración del bot para el owner actual (con defaults persistidos).
  const ownerUserId = resolveRequestOwner(req, { queryField: "ownerUserId" });
  const row = await getOrCreateBotSettings(ownerUserId);
  return res.json(await buildBotSettingsResponse(row, ownerUserId));
};

export const upsertBotSettings = async (req, res) => {
  // Aplica patch validado/normalizado de settings de comportamiento del bot.
  const ownerUserId = resolveRequestOwner(req, { queryField: "ownerUserId" });
  const row = await getOrCreateBotSettings(ownerUserId);
  const updates = normalizeBotSettingsPayload(req.body || {});
  if (Object.keys(updates).length) {
    await row.update(updates);
  }
  return res.json(await buildBotSettingsResponse(row, ownerUserId));
};
