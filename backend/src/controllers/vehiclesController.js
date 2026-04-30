import { FinancingPlan, Vehicle } from "../models/index.js";
import { ApiError } from "../utils/errors.js";

// Scope multi-tenant por propietario autenticado.
const ownerWhere = (userId) => ({ ownerUserId: userId });
const TOP_IMAGES_DEFAULT = 2;
const NEXT_IMAGES_DEFAULT = 5;

// Lista inventario con planes financieros asociados y prioridad comercial.
export const listVehicles = async (req, res) =>
  res.json(
    await Vehicle.findAll({
      where: ownerWhere(req.auth.userId),
      include: [{ model: FinancingPlan, as: "financingPlans", through: { attributes: ["customRate"] } }],
      order: [["outboundPriority", "DESC"], ["updatedAt", "DESC"]],
    })
  );

// Crea vehículo nuevo dentro del tenant actual.
export const createVehicle = async (req, res) => res.status(201).json(await Vehicle.create({ ...req.body, ownerUserId: req.auth.userId }));

export const updateVehicle = async (req, res, next) => {
  // Edita vehículo existente validando ownership.
  const row = await Vehicle.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "Vehicle not found"));
  await row.update(req.body);
  return res.json(row);
};

export const getVehicleById = async (req, res, next) => {
  // Obtiene detalle puntual de vehículo por id.
  const row = await Vehicle.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "Vehicle not found"));
  return res.json(row);
};

export const getVehiclesByFilters = async (req, res) => {
  // Filtros de catálogo usados por backoffice y flujos de bot.
  const where = {
    ...ownerWhere(req.auth.userId),
  };

  if (req.query.brand) where.brand = req.query.brand;
  if (req.query.model) where.model = req.query.model;
  if (req.query.color) where.color = req.query.color;
  if (req.query.year) {
    const year = Number(req.query.year);
    if (!Number.isNaN(year)) where.year = year;
  }

  const rows = await Vehicle.findAll({
    where,
    include: [{ model: FinancingPlan, as: "financingPlans", through: { attributes: ["customRate"] } }],
    order: [["outboundPriority", "DESC"], ["updatedAt", "DESC"]],
  });

  return res.json(rows);
};

export const getVehicleImages = async (req, res, next) => {
  // Paginación de imágenes por cursor para no enviar arreglos grandes en cada request.
  const row = await Vehicle.findOne({
    where: { id: req.params.id, ...ownerWhere(req.auth.userId) },
    attributes: ["id", "imageUrls"],
  });
  if (!row) return next(new ApiError(404, "Vehicle not found"));

  const allImages = Array.isArray(row.imageUrls) ? row.imageUrls : [];
  const mode = req.query.mode === "next" ? "next" : "top";

  const defaultLimit = mode === "top" ? TOP_IMAGES_DEFAULT : NEXT_IMAGES_DEFAULT;
  const limitValue = req.query.limit ? Number(req.query.limit) : defaultLimit;
  const cursorValue = req.query.cursor ? Number(req.query.cursor) : 0;

  const limit = Number.isNaN(limitValue) || limitValue <= 0 ? defaultLimit : limitValue;
  const cursor = Number.isNaN(cursorValue) || cursorValue < 0 ? 0 : cursorValue;

  const startIndex = mode === "top" ? 0 : cursor;
  const endIndex = startIndex + limit;
  const images = allImages.slice(startIndex, endIndex);
  const nextCursor = endIndex < allImages.length ? endIndex : null;

  return res.json({
    vehicleId: row.id,
    mode,
    cursor: startIndex,
    limit,
    total: allImages.length,
    hasMore: nextCursor !== null,
    nextCursor,
    images,
  });
};

export const uploadVehicleImages = async (req, res) => {
  // Devuelve URLs públicas relativas de los archivos subidos por multer.
  const files = req.files || [];
  const imageUrls = files.map((file) => `/uploads/autobot/${file.filename}`);
  return res.status(201).json({ imageUrls });
};
