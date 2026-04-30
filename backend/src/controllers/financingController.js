import {
  FinancingPlan,
  FinancingPlanRequirement,
  FinancingRequirement,
  Vehicle,
  VehicleFinancingPlan,
} from "../models/index.js";
import { ApiError } from "../utils/errors.js";

// Scope multi-tenant por propietario autenticado.
const ownerWhere = (userId) => ({ ownerUserId: userId });

// Helpers de ownership para validar referencias cruzadas.
const getOwnedVehicle = async (userId, vehicleId) => {
  const vehicle = await Vehicle.findOne({ where: { id: vehicleId, ...ownerWhere(userId) } });
  if (!vehicle) throw new ApiError(404, "Vehicle not found");
  return vehicle;
};

const getOwnedPlan = async (userId, planId) => {
  const plan = await FinancingPlan.findOne({ where: { id: planId, ...ownerWhere(userId) } });
  if (!plan) throw new ApiError(404, "Financing plan not found");
  return plan;
};

const getOwnedRequirement = async (userId, requirementId) => {
  const requirement = await FinancingRequirement.findOne({ where: { id: requirementId, ...ownerWhere(userId) } });
  if (!requirement) throw new ApiError(404, "Financing requirement not found");
  return requirement;
};

// Include común para respuestas de planes con requisitos + vehículos relacionados.
const planInclude = [
  { model: FinancingRequirement, as: "requirements", through: { attributes: [] } },
  { model: Vehicle, as: "vehicles", attributes: ["id", "brand", "model", "year"], through: { attributes: ["customRate"] } },
];

export const listFinancingPlans = async (req, res) => {
  // Lista catálogo de planes de financiamiento del tenant.
  const rows = await FinancingPlan.findAll({
    where: ownerWhere(req.auth.userId),
    include: planInclude,
    order: [["updatedAt", "DESC"]],
  });
  return res.json(rows);
};

export const createFinancingPlan = async (req, res) => {
  // Crea plan base y lo retorna con asociaciones incluidas.
  const { name, lender, rate, maxTermMonths, active = true, showRate = true } = req.body;
  const row = await FinancingPlan.create({
    ownerUserId: req.auth.userId,
    name,
    lender,
    rate,
    maxTermMonths,
    active,
    showRate,
  });
  const created = await FinancingPlan.findByPk(row.id, { include: planInclude });
  return res.status(201).json(created);
};

// financing plan por id de vehiculo
export const getFinancingPlanByVehicleId = async (req, res) => {
  // Busca planes asociados a un vehículo específico del mismo owner.
  const vehicleId = req.params.vehicleId ?? req.params.id;
  if (!vehicleId) throw new ApiError(400, "vehicleId is required");
  const userId = req.auth.userId;
  const rows = await FinancingPlan.findAll({
    where: ownerWhere(userId),
    include: [
      { model: FinancingRequirement, as: "requirements", through: { attributes: [] } },
      {
        model: Vehicle,
        as: "vehicles",
        attributes: ["id", "brand", "model", "year"],
        where: { id: vehicleId, ...ownerWhere(userId) },
        through: { attributes: ["customRate"] },
        required: true,
      },
    ],
    order: [["updatedAt", "DESC"]],
  });
  if (!rows.length) throw new ApiError(404, "Financing plan not found");
  return res.json(rows);
};

export const updateFinancingPlan = async (req, res) => {
  // Actualiza campos editables del plan.
  const row = await getOwnedPlan(req.auth.userId, req.params.id);
  const { name, lender, rate, maxTermMonths, active, showRate } = req.body;
  await row.update({ name, lender, rate, maxTermMonths, active, showRate });
  const updated = await FinancingPlan.findByPk(row.id, { include: planInclude });
  return res.json(updated);
};

export const deleteFinancingPlan = async (req, res) => {
  // Elimina plan de forma permanente.
  const row = await getOwnedPlan(req.auth.userId, req.params.id);
  await row.destroy();
  return res.status(204).send();
};

export const listFinancingRequirements = async (req, res) => {
  // Lista requisitos reutilizables para planes de financiamiento.
  const rows = await FinancingRequirement.findAll({ where: ownerWhere(req.auth.userId), order: [["updatedAt", "DESC"]] });
  return res.json(rows);
};

export const createFinancingRequirement = async (req, res) => {
  // Crea requisito documental/operativo.
  const row = await FinancingRequirement.create({ ...req.body, ownerUserId: req.auth.userId });
  return res.status(201).json(row);
};

export const updateFinancingRequirement = async (req, res) => {
  // Edita requisito existente del tenant.
  const row = await getOwnedRequirement(req.auth.userId, req.params.id);
  await row.update(req.body);
  return res.json(row);
};

export const deleteFinancingRequirement = async (req, res) => {
  // Borra requisito (si no hay constraints activas en DB).
  const row = await getOwnedRequirement(req.auth.userId, req.params.id);
  await row.destroy();
  return res.status(204).send();
};

export const attachPlanToVehicle = async (req, res) => {
  // Vincula plan con vehículo y permite tasa custom por relación.
  const userId = req.auth.userId;
  const { vehicleId, planId } = req.params;
  const { customRate } = req.body || {};
  await Promise.all([getOwnedVehicle(userId, vehicleId), getOwnedPlan(userId, planId)]);
  await VehicleFinancingPlan.findOrCreate({
    where: { ownerUserId: userId, vehicleId, financingPlanId: planId },
    defaults: { ownerUserId: userId, vehicleId, financingPlanId: planId, customRate: customRate ?? null },
  });
  if (customRate !== undefined) {
    await VehicleFinancingPlan.update({ customRate }, { where: { ownerUserId: userId, vehicleId, financingPlanId: planId } });
  }
  return res.status(204).send();
};

export const detachPlanFromVehicle = async (req, res) => {
  // Rompe asociación vehículo-plan.
  const userId = req.auth.userId;
  const { vehicleId, planId } = req.params;
  await Promise.all([getOwnedVehicle(userId, vehicleId), getOwnedPlan(userId, planId)]);
  await VehicleFinancingPlan.destroy({ where: { ownerUserId: userId, vehicleId, financingPlanId: planId } });
  return res.status(204).send();
};

export const attachRequirementToPlan = async (req, res) => {
  // Vincula requisito a plan (many-to-many).
  const userId = req.auth.userId;
  const { planId, requirementId } = req.params;
  await Promise.all([getOwnedPlan(userId, planId), getOwnedRequirement(userId, requirementId)]);
  await FinancingPlanRequirement.findOrCreate({
    where: { ownerUserId: userId, financingPlanId: planId, financingRequirementId: requirementId },
    defaults: { ownerUserId: userId, financingPlanId: planId, financingRequirementId: requirementId },
  });
  return res.status(204).send();
};

export const detachRequirementFromPlan = async (req, res) => {
  // Quita requisito de plan.
  const userId = req.auth.userId;
  const { planId, requirementId } = req.params;
  await Promise.all([getOwnedPlan(userId, planId), getOwnedRequirement(userId, requirementId)]);
  await FinancingPlanRequirement.destroy({
    where: { ownerUserId: userId, financingPlanId: planId, financingRequirementId: requirementId },
  });
  return res.status(204).send();
};
