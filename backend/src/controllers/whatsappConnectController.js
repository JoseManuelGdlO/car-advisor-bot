import { z } from "zod";
import { ApiError } from "../utils/errors.js";
import { wcClient } from "../services/wcClient.js";
import { runWithWcToken } from "../services/wcAuthCache.js";
import { resolveWhatsappConnectIntegrationById } from "../services/integrationResolverService.js";

const requestSchema = z
  .object({
    integrationId: z.string().uuid(),
  })
  .strict();

const sendTestTextSchema = z
  .object({
    integrationId: z.string().uuid(),
    to: z.string().min(5).max(40),
    type: z.literal("text").optional(),
    text: z.string().min(1).max(4096),
  })
  .strict();

const sendTestImageSchema = z
  .object({
    integrationId: z.string().uuid(),
    to: z.string().min(5).max(40),
    type: z.literal("image"),
    imageUrl: z.string().url().max(4096),
    caption: z.string().min(1).max(1024).optional(),
  })
  .strict();

export const sendTestSchema = z.union([sendTestTextSchema, sendTestImageSchema]);

/**
 * Verifica que la integracion indicada pertenezca al usuario autenticado
 * y que corresponda a WhatsApp Connect.
 */
const getIntegrationContext = async (integrationId, ownerUserId) => {
  // Carga integración + credenciales activas y valida mínimos operativos para WC.
  const { integration, credentials } = await resolveWhatsappConnectIntegrationById({ integrationId, ownerUserId });
  if (integration.status !== "active") throw new ApiError(400, "Integration must be active");
  if (!credentials.deviceId) throw new ApiError(400, "Integration credentials missing deviceId");
  return { integration, credentials };
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
    const { credentials } = await getIntegrationContext(integrationId, req.auth.userId);

    const result = await runWithWcToken(async () => {
      // Inicia/renueva la sesion del device antes de emitir el link publico.
      await wcClient.connectDevice(credentials.deviceId);
      return wcClient.createPublicLink(credentials.deviceId);
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

export const getWhatsappConnectDeviceStatus = async (req, res, next) => {
  try {
    // Consulta estado online/offline del device asociado a la integración.
    const { integrationId } = requestSchema.parse(req.query || {});
    const { credentials } = await getIntegrationContext(integrationId, req.auth.userId);
    const result = await runWithWcToken(() => wcClient.getDeviceStatus({ deviceId: credentials.deviceId }));
    return res.json(result);
  } catch (err) {
    return next(err);
  }
};

export const postWhatsappConnectSendTest = async (req, res, next) => {
  try {
    // Endpoint de diagnóstico para verificar envío saliente controlado.
    const parsed = sendTestSchema.parse(req.body || {});
    const { integrationId, ...messagePayload } = parsed;
    const { credentials } = await getIntegrationContext(integrationId, req.auth.userId);
    await runWithWcToken(
      () =>
        wcClient.sendMessageWithRetry({
          deviceId: credentials.deviceId,
          ...messagePayload,
          tenantId: credentials.tenantId,
        }),
    );
    return res.status(202).json({ ok: true });
  } catch (err) {
    return next(err);
  }
};
