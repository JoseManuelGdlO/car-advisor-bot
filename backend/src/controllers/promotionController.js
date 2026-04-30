import { Promotion, Vehicle } from "../models/index.js";
import { ApiError } from "../utils/errors.js";

// Scope multi-tenant por propietario autenticado.
const ownerWhere = (userId) => ({ ownerUserId: userId });

// Helper de ownership para evitar exponer promociones de vehículos ajenos.
const getOwnedVehicle = async (userId, vehicleId) => {
  const vehicle = await Vehicle.findOne({ where: { id: vehicleId, ...ownerWhere(userId) } });
  if (!vehicle) throw new ApiError(404, "Vehicle not found");
  return vehicle;
};

// Lista promociones del tenant en orden de actualización.
export const listPromotions = async (req, res) =>
  res.json(await Promotion.findAll({ where: ownerWhere(req.auth.userId), order: [["updatedAt", "DESC"]] }));

export const getPromotionsByVehicleId = async (req, res) => {
  // Filtra promociones activas aplicables a un vehículo puntual.
  const vehicleId = req.params.vehicleId ?? req.params.id;
  if (!vehicleId) throw new ApiError(400, "vehicleId is required");
  const userId = req.auth.userId;
  await getOwnedVehicle(userId, vehicleId);
  const rows = await Promotion.findAll({
    where: { ...ownerWhere(userId), active: true },
    order: [["updatedAt", "DESC"]],
  });
  const filtered = rows.filter((row) => {
    const vehicleIds = row?.vehicleIds;
    return Array.isArray(vehicleIds) && vehicleIds.some((item) => String(item).trim() === String(vehicleId).trim());
  });
  return res.json(filtered);
};

// Crea promoción asociada al owner actual.
export const createPromotion = async (req, res) => res.status(201).json(await Promotion.create({ ...req.body, ownerUserId: req.auth.userId }));

export const updatePromotion = async (req, res, next) => {
  // Actualiza metadata de promoción existente.
  const row = await Promotion.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "Promotion not found"));
  await row.update(req.body);
  return res.json(row);
};

export const togglePromotion = async (req, res, next) => {
  // Habilita/deshabilita promoción sin eliminarla.
  const row = await Promotion.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "Promotion not found"));
  await row.update({ active: !row.active });
  return res.json(row);
};
