#!/usr/bin/env node
/**
 * Importa vehículos Suzuki desde manifest.json generado por extract.py.
 *
 * Uso:
 *   node scripts/import-suzuki-vehicles.mjs --dry-run
 *   node scripts/import-suzuki-vehicles.mjs
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Vehicle } from "../src/models/index.js";
import { sequelize } from "../src/config/database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST = path.resolve(__dirname, ".suzuki-import/manifest.json");

/** Límites de columnas en vehicles (Vehicle.js). */
const FIELD_LIMITS = {
  brand: 80,
  model: 80,
  engine: 80,
  color: 80,
  transmission: 40,
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const manifestFlagIndex = args.indexOf("--manifest");
const manifestPath =
  manifestFlagIndex >= 0 && args[manifestFlagIndex + 1]
    ? path.resolve(process.cwd(), args[manifestFlagIndex + 1])
    : DEFAULT_MANIFEST;

function loadManifest(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error(`Manifest inválido: se esperaba un arreglo en ${filePath}`);
  }
  return data;
}

function clampField(value, field, label) {
  const limit = FIELD_LIMITS[field];
  if (!value || !limit || value.length <= limit) return value;
  console.warn(`[warn] ${label}: truncando ${field} (${value.length} -> ${limit} chars)`);
  return value.slice(0, limit);
}

function toVehiclePayload(entry) {
  const label = entry.sourcePdf || entry.model || "desconocido";
  const metadata = { ...(entry.metadata ?? {}) };

  if (entry.transmissionFull && !metadata.transmissionFull) {
    metadata.transmissionFull = entry.transmissionFull;
  }

  return {
    ownerUserId: entry.ownerUserId,
    brand: clampField(entry.brand, "brand", label),
    model: clampField(entry.model, "model", label),
    year: entry.year,
    price: entry.price ?? 0,
    km: entry.km ?? 0,
    transmission: clampField(entry.transmission, "transmission", label),
    engine: clampField(entry.engine, "engine", label),
    color: clampField(entry.color, "color", label),
    status: "available",
    image: "🚗",
    imageUrls: [entry.imageUrl],
    metadata,
    outboundPriority: 0,
  };
}

async function main() {
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Modo: ${dryRun ? "dry-run (sin DB)" : "import"}`);

  const entries = loadManifest(manifestPath);
  const stats = { inserted: 0, skipped: 0, duplicates: 0, errors: 0 };

  if (!dryRun) {
    await sequelize.authenticate();
  }

  for (const entry of entries) {
    const label = entry.sourcePdf || entry.model || "desconocido";

    if (entry.skipped) {
      stats.skipped += 1;
      console.log(`[omitido] ${label}: ${entry.skipReason || "marcado como skipped"}`);
      continue;
    }

    const payload = toVehiclePayload(entry);

    if (dryRun) {
      stats.inserted += 1;
      console.log(`[dry-run] ${label}`);
      console.log(JSON.stringify(payload, null, 2));
      continue;
    }

    try {
      const existing = await Vehicle.findOne({
        where: {
          ownerUserId: payload.ownerUserId,
          brand: payload.brand,
          model: payload.model,
          year: payload.year,
        },
      });

      if (existing) {
        stats.duplicates += 1;
        console.log(`[duplicado] ${label} -> id=${existing.id}`);
        continue;
      }

      const created = await Vehicle.create(payload);
      stats.inserted += 1;
      console.log(`[insertado] ${label} -> id=${created.id}`);
    } catch (error) {
      stats.errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[error] ${label}: ${message}`);
    }
  }

  if (!dryRun) {
    await sequelize.close();
  }

  console.log("\nResumen:");
  console.log(`  Insertados: ${stats.inserted}`);
  console.log(`  Duplicados: ${stats.duplicates}`);
  console.log(`  Omitidos:   ${stats.skipped}`);
  console.log(`  Errores:    ${stats.errors}`);

  if (stats.errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
