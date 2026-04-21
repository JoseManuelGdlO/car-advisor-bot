import {
  FinancingPlan,
  FinancingPlanRequirement,
  FinancingRequirement,
  Vehicle,
  VehicleFinancingPlan,
} from "../models/index.js";
import { ApiError } from "../utils/errors.js";

const ownerWhere = (userId) => ({ ownerUserId: userId });

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

const planInclude = [
  { model: FinancingRequirement, as: "requirements", through: { attributes: [] } },
  { model: Vehicle, as: "vehicles", attributes: ["id", "brand", "model", "year"], through: { attributes: ["customRate"] } },
];

export const listFinancingPlans = async (req, res) => {
  const rows = await FinancingPlan.findAll({
    where: ownerWhere(req.auth.userId),
    include: planInclude,
    order: [["updatedAt", "DESC"]],
  });
  return res.json(rows);
};

export const createFinancingPlan = async (req, res) => {
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

export const updateFinancingPlan = async (req, res) => {
  const row = await getOwnedPlan(req.auth.userId, req.params.id);
  const { name, lender, rate, maxTermMonths, active, showRate } = req.body;
  await row.update({ name, lender, rate, maxTermMonths, active, showRate });
  const updated = await FinancingPlan.findByPk(row.id, { include: planInclude });
  return res.json(updated);
};

export const deleteFinancingPlan = async (req, res) => {
  const row = await getOwnedPlan(req.auth.userId, req.params.id);
  await row.destroy();
  return res.status(204).send();
};

export const listFinancingRequirements = async (req, res) => {
  const rows = await FinancingRequirement.findAll({ where: ownerWhere(req.auth.userId), order: [["updatedAt", "DESC"]] });
  return res.json(rows);
};

export const createFinancingRequirement = async (req, res) => {
  const row = await FinancingRequirement.create({ ...req.body, ownerUserId: req.auth.userId });
  return res.status(201).json(row);
};

export const updateFinancingRequirement = async (req, res) => {
  const row = await getOwnedRequirement(req.auth.userId, req.params.id);
  await row.update(req.body);
  return res.json(row);
};

export const deleteFinancingRequirement = async (req, res) => {
  const row = await getOwnedRequirement(req.auth.userId, req.params.id);
  await row.destroy();
  return res.status(204).send();
};

export const attachPlanToVehicle = async (req, res) => {
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
  const userId = req.auth.userId;
  const { vehicleId, planId } = req.params;
  await Promise.all([getOwnedVehicle(userId, vehicleId), getOwnedPlan(userId, planId)]);
  await VehicleFinancingPlan.destroy({ where: { ownerUserId: userId, vehicleId, financingPlanId: planId } });
  return res.status(204).send();
};

export const attachRequirementToPlan = async (req, res) => {
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
  const userId = req.auth.userId;
  const { planId, requirementId } = req.params;
  await Promise.all([getOwnedPlan(userId, planId), getOwnedRequirement(userId, requirementId)]);
  await FinancingPlanRequirement.destroy({
    where: { ownerUserId: userId, financingPlanId: planId, financingRequirementId: requirementId },
  });
  return res.status(204).send();
};
