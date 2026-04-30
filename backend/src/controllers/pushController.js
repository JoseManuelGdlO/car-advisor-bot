import { z } from "zod";
import { deactivatePushDevice, sendPushToOwner, upsertPushDevice } from "../services/pushService.js";
import { ApiError } from "../utils/errors.js";

const registerDeviceSchema = z.object({
  token: z.string().min(20).max(255),
  platform: z.enum(["android", "ios"]),
});

const sendPushSchema = z.object({
  ownerUserId: z.string().uuid().optional(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.string()).optional(),
});

const botPushNotifySchema = z.object({
  owner_user_id: z.string().uuid(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  data: z.record(z.string(), z.string()).optional(),
});

export const registerPushDevice = async (req, res, next) => {
  try {
    // Registra/actualiza token de push para el usuario autenticado.
    const { token, platform } = registerDeviceSchema.parse(req.body);
    const device = await upsertPushDevice({
      ownerUserId: req.auth.userId,
      token,
      platform,
    });
    return res.status(201).json({
      ok: true,
      id: device.id,
      token: device.token,
      platform: device.platform,
      isActive: device.isActive,
    });
  } catch (error) {
    return next(error);
  }
};

export const unregisterPushDevice = async (req, res, next) => {
  try {
    // Baja lógica del token de push sin destruir historial.
    const removed = await deactivatePushDevice({
      ownerUserId: req.auth.userId,
      token: String(req.params.token || ""),
    });
    return res.json({ ok: true, removed });
  } catch (error) {
    return next(error);
  }
};

export const sendPush = async (req, res, next) => {
  try {
    // Envío manual de push (usuario o servicio con owner explícito).
    const payload = sendPushSchema.parse(req.body);
    let ownerUserId;
    if (req.auth.type === "user") {
      ownerUserId = req.auth.userId;
    } else {
      if (!payload.ownerUserId) {
        throw new ApiError(400, "ownerUserId is required when using a service token; use POST /api/bot/push-notify instead");
      }
      ownerUserId = payload.ownerUserId;
    }
    const result = await sendPushToOwner({
      ownerUserId,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
};

export const botPushNotify = async (req, res, next) => {
  try {
    // Endpoint machine-to-machine usado por el bot para notificaciones al owner.
    const payload = botPushNotifySchema.parse(req.body);
    const result = await sendPushToOwner({
      ownerUserId: payload.owner_user_id,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
};
