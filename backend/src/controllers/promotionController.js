import { Promotion } from "../models/index.js";
import { ApiError } from "../utils/errors.js";

const ownerWhere = (userId) => ({ ownerUserId: userId });

export const listPromotions = async (req, res) =>
  res.json(await Promotion.findAll({ where: ownerWhere(req.auth.userId), order: [["updatedAt", "DESC"]] }));

export const createPromotion = async (req, res) => res.status(201).json(await Promotion.create({ ...req.body, ownerUserId: req.auth.userId }));

export const updatePromotion = async (req, res, next) => {
  const row = await Promotion.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "Promotion not found"));
  await row.update(req.body);
  return res.json(row);
};

export const togglePromotion = async (req, res, next) => {
  const row = await Promotion.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "Promotion not found"));
  await row.update({ active: !row.active });
  return res.json(row);
};
