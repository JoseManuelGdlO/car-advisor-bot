import { z } from "zod";
import {
  deleteOwnerNotification,
  listOwnerNotifications,
  markAllOwnerNotificationsRead,
  markOwnerNotificationRead,
} from "../services/ownerNotifications.js";

const listQuerySchema = z.object({
  kind: z.string().trim().max(64).optional(),
  unreadOnly: z
    .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0"), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "true" || value === "1"),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const markAllSchema = z
  .object({
    kind: z.string().trim().max(64).optional(),
  })
  .strict();

export const listNotifications = async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query || {});
    if (!parsed.success) throw parsed.error;

    const result = await listOwnerNotifications({
      ownerUserId: req.auth.userId,
      kind: parsed.data.kind,
      unreadOnly: parsed.data.unreadOnly === true,
      limit: parsed.data.limit,
    });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
};

export const markNotificationRead = async (req, res, next) => {
  try {
    const item = await markOwnerNotificationRead({
      ownerUserId: req.auth.userId,
      id: req.params.id,
    });
    return res.json(item);
  } catch (err) {
    return next(err);
  }
};

export const markAllNotificationsRead = async (req, res, next) => {
  try {
    const parsed = markAllSchema.safeParse(req.body || {});
    if (!parsed.success) throw parsed.error;

    const result = await markAllOwnerNotificationsRead({
      ownerUserId: req.auth.userId,
      kind: parsed.data.kind,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return next(err);
  }
};

export const deleteNotification = async (req, res, next) => {
  try {
    await deleteOwnerNotification({
      ownerUserId: req.auth.userId,
      id: req.params.id,
    });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
};
