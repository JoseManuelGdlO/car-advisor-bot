import { z } from "zod";
import { ChannelIntegration } from "../models/index.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import { wcClient } from "../services/wcClient.js";
import { runWithWcToken } from "../services/wcAuthCache.js";

const requestSchema = z
  .object({
    integrationId: z.string().uuid().optional(),
  })
  .strict();

/**
 * Verifica que la integracion indicada pertenezca al usuario autenticado
 * y que corresponda a WhatsApp Connect.
 */
const assertOwnWhatsappConnectIntegration = async (integrationId, userId) => {
  if (!integrationId) return;

  const integration = await ChannelIntegration.findOne({
    where: { id: integrationId, ownerUserId: userId },
  });

  if (!integration) throw new ApiError(404, "Integration not found");
  if (integration.channel !== "whatsapp") throw new ApiError(400, "Integration channel must be whatsapp");
  if (integration.provider !== "whatsapp-connect") throw new ApiError(400, "Integration provider must be whatsapp-connect");
};

/**
 * Genera un link publico de QR para WhatsApp Connect.
 * Flujo:
 * 1) valida payload y pertenencia de integracion (opcional),
 * 2) obtiene token WC (con cache/retry en servicio),
 * 3) ejecuta connect y public-link,
 * 4) retorna { url, expiresAt } al frontend.
 */
export const postWhatsappConnectQrLink = async (req, res, next) => {
  try {
    const { integrationId } = requestSchema.parse(req.body || {});
    await assertOwnWhatsappConnectIntegration(integrationId, req.auth.userId);

    const result = await runWithWcToken(async (token) => {
      // Inicia/renueva la sesion del device antes de emitir el link publico.
      await wcClient.connectDevice(env.wc.deviceId, token);
      return wcClient.createPublicLink(env.wc.deviceId, token);
    });

    // Si upstream no envia expiracion, usamos un fallback corto para UX.
    return res.json({
      url: result.url,
      expiresAt: result.expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    return next(err);
  }
};
