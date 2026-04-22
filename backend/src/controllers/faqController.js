import { Faq } from "../models/index.js";
import { ApiError } from "../utils/errors.js";

const ownerWhere = (userId) => ({ ownerUserId: userId });

export const listFaqs = async (req, res) => res.json(await Faq.findAll({ where: ownerWhere(req.auth.userId), order: [["updatedAt", "DESC"]] }));

export const createFaq = async (req, res) => res.status(201).json(await Faq.create({ ...req.body, ownerUserId: req.auth.userId }));

export const updateFaq = async (req, res, next) => {
  const row = await Faq.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "FAQ not found"));
  await row.update({ question: req.body.question, answer: req.body.answer });
  return res.json(row);
};

export const deleteFaq = async (req, res, next) => {
  const row = await Faq.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "FAQ not found"));
  await row.destroy();
  return res.status(204).send();
};
