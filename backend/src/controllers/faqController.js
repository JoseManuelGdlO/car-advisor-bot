import { Faq } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { resolveTenantOwnerId } from "../utils/tenantAccess.js";

// Scope multi-tenant por propietario autenticado.
const ownerWhere = (userId) => ({ ownerUserId: userId });

// Lista las FAQs del tenant. Admin y vendedor ven y editan las mismas.
export const listFaqs = async (req, res) =>
  res.json(await Faq.findAll({ where: ownerWhere(resolveTenantOwnerId(req)), order: [["updatedAt", "DESC"]] }));

// Crea FAQ dentro del tenant actual (el vendedor escribe a nombre del admin dueño).
export const createFaq = async (req, res) =>
  res.status(201).json(await Faq.create({ ...req.body, ownerUserId: resolveTenantOwnerId(req) }));

export const updateFaq = async (req, res, next) => {
  // Actualiza solo si la FAQ pertenece al tenant.
  const row = await Faq.findOne({ where: { id: req.params.id, ...ownerWhere(resolveTenantOwnerId(req)) } });
  if (!row) return next(new ApiError(404, "FAQ not found"));
  await row.update({ question: req.body.question, answer: req.body.answer });
  return res.json(row);
};

export const deleteFaq = async (req, res, next) => {
  // Eliminación definitiva de una FAQ del tenant.
  const row = await Faq.findOne({ where: { id: req.params.id, ...ownerWhere(resolveTenantOwnerId(req)) } });
  if (!row) return next(new ApiError(404, "FAQ not found"));
  await row.destroy();
  return res.status(204).send();
};
