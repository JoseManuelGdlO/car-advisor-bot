import { FinancingPlan, Vehicle } from "../models/index.js";
import { ApiError } from "../utils/errors.js";

const ownerWhere = (userId) => ({ ownerUserId: userId });

export const listVehicles = async (req, res) =>
  res.json(
    await Vehicle.findAll({
      where: ownerWhere(req.auth.userId),
      include: [{ model: FinancingPlan, as: "financingPlans", through: { attributes: ["customRate"] } }],
      order: [["outboundPriority", "DESC"], ["updatedAt", "DESC"]],
    })
  );

export const createVehicle = async (req, res) => res.status(201).json(await Vehicle.create({ ...req.body, ownerUserId: req.auth.userId }));

export const updateVehicle = async (req, res, next) => {
  const row = await Vehicle.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "Vehicle not found"));
  await row.update(req.body);
  return res.json(row);
};

export const uploadVehicleImages = async (req, res) => {
  const files = req.files || [];
  const imageUrls = files.map((file) => `/uploads/autobot/${file.filename}`);
  return res.status(201).json({ imageUrls });
};
