import { Faq } from "../models/index.js";
import { ApiError } from "../utils/errors.js";

// Scope multi-tenant por propietario autenticado.
const ownerWhere = (userId) => ({ ownerUserId: userId });

// Lista FAQs del usuario para administración de respuestas rápidas.
export const listFaqs = async (req, res) => res.json(await Faq.findAll({ where: ownerWhere(req.auth.userId), order: [["updatedAt", "DESC"]] }));

// Crea FAQ asociada al owner actual.
export const createFaq = async (req, res) => res.status(201).json(await Faq.create({ ...req.body, ownerUserId: req.auth.userId }));

export const updateFaq = async (req, res, next) => {
  // Actualiza solo si la FAQ pertenece al usuario.
  const row = await Faq.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "FAQ not found"));
  await row.update({ question: req.body.question, answer: req.body.answer });
  return res.json(row);
};

export const deleteFaq = async (req, res, next) => {
  // Eliminación definitiva de una FAQ propia.
  const row = await Faq.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "FAQ not found"));
  await row.destroy();
  return res.status(204).send();
};
