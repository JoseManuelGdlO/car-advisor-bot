import { normalizeBotSettingsPayload, toBotSettingsDto } from "../utils/botSettings.js";
import { getOrCreateBotSettings } from "../services/botSettingsService.js";

export const getBotSettings = async (req, res) => {
  // Obtiene configuración del bot para el owner actual (con defaults persistidos).
  const row = await getOrCreateBotSettings(req.auth.userId);
  return res.json(toBotSettingsDto(row));
};

export const upsertBotSettings = async (req, res) => {
  // Aplica patch validado/normalizado de settings de comportamiento del bot.
  const row = await getOrCreateBotSettings(req.auth.userId);
  const updates = normalizeBotSettingsPayload(req.body || {});
  if (Object.keys(updates).length) {
    await row.update(updates);
  }
  return res.json(toBotSettingsDto(row));
};
