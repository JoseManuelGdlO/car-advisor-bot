/** Normaliza espacios y minúsculas para comparar nombres de interés. */
export const normalizeProductName = (name = "") =>
  String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const YEAR_TOKEN_RE = /^(19|20)\d{2}$/;

/** Elimina años finales duplicados: "Swift 2026 2026" → "Swift 2026". */
export const normalizeInterestedInLabel = (raw = "") => {
  let name = String(raw || "").trim().replace(/\s+/g, " ");
  if (!name) return "";

  const tokens = name.split(" ");
  while (tokens.length >= 2) {
    const last = tokens[tokens.length - 1];
    const prev = tokens[tokens.length - 2];
    if (YEAR_TOKEN_RE.test(last) && last === prev) {
      tokens.pop();
      continue;
    }
    break;
  }
  return tokens.join(" ");
};

/** Nombre de catálogo actual (marca + modelo), sin año; alineado a Productos. */
export const formatVehicleDisplayName = (vehicle = {}) => {
  const brand = String(vehicle.brand || "").trim();
  const model = String(vehicle.model || "").trim();
  return `${brand} ${model}`.trim();
};

/** Variantes históricas usadas para emparejar `interested_in` con el inventario. */
export const vehicleMatchKeys = (vehicle = {}) => {
  const brand = String(vehicle.brand || "").trim();
  const model = String(vehicle.model || "").trim();
  const yearNum = Number(vehicle.year);
  const year = Number.isFinite(yearNum) && yearNum > 0 ? String(Math.trunc(yearNum)) : "";
  const base = `${brand} ${model}`.trim();
  if (!base) return [];

  const keys = new Set([normalizeProductName(base), normalizeProductName(normalizeInterestedInLabel(base))]);

  if (year) {
    const withYear = `${base} ${year}`.trim();
    const withDupYear = `${base} ${year} ${year}`.trim();
    keys.add(normalizeProductName(withYear));
    keys.add(normalizeProductName(normalizeInterestedInLabel(withYear)));
    keys.add(normalizeProductName(withDupYear));
    keys.add(normalizeProductName(normalizeInterestedInLabel(withDupYear)));

    // Si el modelo aún trae el año embebido, también indexar brand+model sin ese año.
    const modelTokens = model.split(/\s+/).filter(Boolean);
    if (modelTokens.length && modelTokens[modelTokens.length - 1] === year) {
      const modelWithoutYear = modelTokens.slice(0, -1).join(" ");
      const baseWithoutYear = `${brand} ${modelWithoutYear}`.trim();
      if (baseWithoutYear) {
        keys.add(normalizeProductName(baseWithoutYear));
        keys.add(normalizeProductName(`${baseWithoutYear} ${year}`));
      }
    }
  }

  return [...keys].filter(Boolean);
};

/** Índice label normalizado → vehículo (primera unidad si hay duplicados). */
export const buildVehicleMatchIndex = (vehicles = []) => {
  const index = new Map();
  for (const vehicle of vehicles) {
    for (const key of vehicleMatchKeys(vehicle)) {
      if (!index.has(key)) index.set(key, vehicle);
    }
  }
  return index;
};

export const matchInterestToVehicle = (label, matchIndex) => {
  if (!matchIndex || !(matchIndex instanceof Map)) return null;
  const normalized = normalizeProductName(normalizeInterestedInLabel(label));
  if (!normalized) return null;
  if (matchIndex.has(normalized)) return matchIndex.get(normalized);

  // Quitar un año final suelto y reintentar (interes histórico "… 2026").
  const stripped = normalized.replace(/\s+(19|20)\d{2}$/, "").trim();
  if (stripped && stripped !== normalized && matchIndex.has(stripped)) {
    return matchIndex.get(stripped);
  }
  return null;
};

/**
 * Construye el ranking: prioriza interestedVehicleId, resuelve texto histórico al catálogo,
 * muestra el nombre actual (brand+model) y agrega el inventario sin consultas con 0.
 */
export const buildTopProductsRanking = ({ leads = [], vehicles = [], limit, includeZero = false } = {}) => {
  const vehicleById = new Map(
    vehicles
      .filter((v) => v && v.id != null && String(v.id).trim())
      .map((v) => [String(v.id), v]),
  );
  const matchIndex = buildVehicleMatchIndex(vehicles);
  const counts = new Map();
  const displayNames = new Map();

  const bump = (key, displayName, amount = 1) => {
    if (!key || !displayName) return;
    counts.set(key, (counts.get(key) || 0) + amount);
    if (!displayNames.has(key)) displayNames.set(key, displayName);
  };

  for (const lead of leads) {
    const vehicleId = String(lead.interestedVehicleId || lead.interested_vehicle_id || "").trim();
    const interestLabel = String(lead.interestedIn || lead.interested_in || "").trim();

    let vehicle = vehicleId ? vehicleById.get(vehicleId) || null : null;
    if (!vehicle && interestLabel) {
      vehicle = matchInterestToVehicle(interestLabel, matchIndex);
    }

    if (vehicle) {
      const displayName = formatVehicleDisplayName(vehicle);
      const key = `name:${normalizeProductName(displayName)}`;
      bump(key, displayName);
      continue;
    }

    const normalizedLabel = normalizeInterestedInLabel(interestLabel);
    if (!normalizedLabel) continue;
    const key = `text:${normalizeProductName(normalizedLabel)}`;
    bump(key, normalizedLabel);
  }

  const ranked = [...counts.entries()]
    .map(([key, queries]) => ({ key, name: displayNames.get(key), queries }))
    .filter((item) => item.name)
    .sort((a, b) => b.queries - a.queries || a.name.localeCompare(b.name, "es"));

  if (!includeZero) {
    const limited =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? ranked.slice(0, limit) : ranked;
    return limited.map(({ name, queries }) => ({ name, queries }));
  }

  const seen = new Set(ranked.map((item) => normalizeProductName(item.name)));
  const missing = [];
  for (const vehicle of vehicles) {
    const displayName = formatVehicleDisplayName(vehicle);
    const norm = normalizeProductName(displayName);
    if (!displayName || seen.has(norm)) continue;
    seen.add(norm);
    missing.push({ name: displayName, queries: 0 });
  }
  missing.sort((a, b) => a.name.localeCompare(b.name, "es"));

  const combined = [...ranked.map(({ name, queries }) => ({ name, queries })), ...missing];
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    return combined.slice(0, limit);
  }
  return combined;
};
