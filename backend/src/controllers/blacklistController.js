import { z } from "zod";
import {
  addBlacklistedPhone,
  listBlacklistedPhones,
  removeBlacklistedPhone,
} from "../services/phoneBlacklistService.js";

const createBlacklistSchema = z.object({
  phone: z.string().min(1).max(40),
});

const blacklistIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listBlacklist = async (req, res, next) => {
  try {
    const rows = await listBlacklistedPhones(req.auth.userId);
    return res.json(
      rows.map((row) => ({
        id: row.id,
        phone: row.phone,
        createdAt: row.createdAt,
      }))
    );
  } catch (error) {
    return next(error);
  }
};

export const createBlacklistEntry = async (req, res, next) => {
  try {
    const payload = createBlacklistSchema.parse(req.body);
    const row = await addBlacklistedPhone(req.auth.userId, payload.phone);
    return res.status(201).json({
      id: row.id,
      phone: row.phone,
      createdAt: row.createdAt,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteBlacklistEntry = async (req, res, next) => {
  try {
    const { id } = blacklistIdParamsSchema.parse(req.params);
    await removeBlacklistedPhone(req.auth.userId, id);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
};
