import { Op } from "sequelize";
import { Promotion, Vehicle } from "../models/index.js";
import { ApiError } from "../utils/errors.js";

// Scope multi-tenant por propietario autenticado.
const ownerWhere = (userId) => ({ ownerUserId: userId });

const VEHICLE_LABEL_MISSING = "[no disponible]";

/** Misma forma que `format_vehicle_name` en el bot: marca modelo año. */
function promotionVehicleLabel(vehicle) {
  const brand = String(vehicle?.brand ?? "").trim();
  const model = String(vehicle?.model ?? "").trim();
  const year = vehicle?.year;
  const suffix = typeof year === "number" && Number.isFinite(year) ? ` ${year}` : "";
  const label = `${brand} ${model}${suffix}`.trim();
  return label || VEHICLE_LABEL_MISSING;
}

// Helper de ownership para evitar exponer promociones de vehículos ajenos.
const getOwnedVehicle = async (userId, vehicleId) => {
  const vehicle = await Vehicle.findOne({ where: { id: vehicleId, ...ownerWhere(userId) } });
  if (!vehicle) throw new ApiError(404, "Vehicle not found");
  return vehicle;
};

// Lista promociones del tenant en orden de actualización.
export const listPromotions = async (req, res) => {
  const userId = req.auth.userId;
  const rows = await Promotion.findAll({ where: ownerWhere(userId), order: [["updatedAt", "DESC"]] });
  const plains = rows.map((row) => row.get({ plain: true }));
  const idSet = new Set();
  for (const p of plains) {
    for (const raw of Array.isArray(p.vehicleIds) ? p.vehicleIds : []) {
      const id = String(raw ?? "").trim();
      if (id) idSet.add(id);
    }
  }
  const uniq = [...idSet];
  let byId = new Map();
  if (uniq.length) {
    const found = await Vehicle.findAll({
      where: { ownerUserId: userId, id: { [Op.in]: uniq } },
      attributes: ["id", "brand", "model", "year"],
    });
    byId = new Map(found.map((v) => {
      const pl = v.get({ plain: true });
      return [String(pl.id), pl];
    }));
  }
  const payload = plains.map((p) => {
    const ids = Array.isArray(p.vehicleIds)
      ? p.vehicleIds.map((x) => String(x ?? "").trim()).filter(Boolean)
      : [];
    const vehicleLabels = ids.map((vid) => {
      const v = byId.get(vid);
      return v ? promotionVehicleLabel(v) : VEHICLE_LABEL_MISSING;
    });
    return { ...p, vehicleLabels };
  });
  return res.json(payload);
};

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
  const plains = filtered.map((row) => row.get({ plain: true }));
  const idSet = new Set();
  for (const p of plains) {
    for (const raw of Array.isArray(p.vehicleIds) ? p.vehicleIds : []) {
      const id = String(raw ?? "").trim();
      if (id) idSet.add(id);
    }
  }
  const uniq = [...idSet];
  let byId = new Map();
  if (uniq.length) {
    const found = await Vehicle.findAll({
      where: { ownerUserId: userId, id: { [Op.in]: uniq } },
      attributes: ["id", "brand", "model", "year"],
    });
    byId = new Map(found.map((v) => {
      const pl = v.get({ plain: true });
      return [String(pl.id), pl];
    }));
  }
  const payload = plains.map((p) => {
    const ids = Array.isArray(p.vehicleIds)
      ? p.vehicleIds.map((x) => String(x ?? "").trim()).filter(Boolean)
      : [];
    const vehicleLabels = ids.map((vid) => {
      const v = byId.get(vid);
      return v ? promotionVehicleLabel(v) : VEHICLE_LABEL_MISSING;
    });
    return { ...p, vehicleLabels };
  });
  return res.json(payload);
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
