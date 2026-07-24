"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") {
      console.warn("[202607241300-client-lead-interested-vehicle] Skipping: expected mysql dialect");
      return;
    }

    await queryInterface.sequelize.query(
      "ALTER TABLE client_leads ADD COLUMN interested_vehicle_id CHAR(36) NULL AFTER interested_in",
    );

    // Normaliza años duplicados en interested_in y rellena interested_vehicle_id cuando hay match.
    const [leads] = await queryInterface.sequelize.query(
      `SELECT id, owner_user_id AS ownerUserId, interested_in AS interestedIn
       FROM client_leads
       WHERE interested_in IS NOT NULL AND TRIM(interested_in) <> ''`,
    );
    const [vehicles] = await queryInterface.sequelize.query(
      `SELECT id, owner_user_id AS ownerUserId, brand, model, year FROM vehicles`,
    );

    const normalize = (name) =>
      String(name || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

    const stripDupYears = (raw) => {
      let name = String(raw || "").trim().replace(/\s+/g, " ");
      const tokens = name.split(" ");
      while (tokens.length >= 2) {
        const last = tokens[tokens.length - 1];
        const prev = tokens[tokens.length - 2];
        if (/^(19|20)\d{2}$/.test(last) && last === prev) {
          tokens.pop();
          continue;
        }
        break;
      }
      return tokens.join(" ");
    };

    const vehiclesByOwner = new Map();
    for (const vehicle of vehicles) {
      const ownerId = String(vehicle.ownerUserId);
      if (!vehiclesByOwner.has(ownerId)) vehiclesByOwner.set(ownerId, []);
      vehiclesByOwner.get(ownerId).push(vehicle);
    }

    const matchKeysFor = (vehicle) => {
      const brand = String(vehicle.brand || "").trim();
      const model = String(vehicle.model || "").trim();
      const yearNum = Number(vehicle.year);
      const year = Number.isFinite(yearNum) && yearNum > 0 ? String(Math.trunc(yearNum)) : "";
      const base = `${brand} ${model}`.trim();
      const keys = new Set([normalize(base), normalize(stripDupYears(base))]);
      if (year) {
        keys.add(normalize(`${base} ${year}`));
        keys.add(normalize(`${base} ${year} ${year}`));
        keys.add(normalize(stripDupYears(`${base} ${year}`)));
        const modelTokens = model.split(/\s+/).filter(Boolean);
        if (modelTokens.length && modelTokens[modelTokens.length - 1] === year) {
          const modelWithoutYear = modelTokens.slice(0, -1).join(" ");
          const baseWithoutYear = `${brand} ${modelWithoutYear}`.trim();
          if (baseWithoutYear) {
            keys.add(normalize(baseWithoutYear));
            keys.add(normalize(`${baseWithoutYear} ${year}`));
          }
        }
      }
      return keys;
    };

    for (const lead of leads) {
      const cleaned = stripDupYears(lead.interestedIn);
      const ownerVehicles = vehiclesByOwner.get(String(lead.ownerUserId)) || [];
      let matchedId = null;
      let displayName = cleaned;
      const labelKey = normalize(cleaned);
      const strippedKey = normalize(cleaned.replace(/\s+(19|20)\d{2}$/, "").trim());

      for (const vehicle of ownerVehicles) {
        const keys = matchKeysFor(vehicle);
        if (keys.has(labelKey) || (strippedKey && keys.has(strippedKey))) {
          matchedId = vehicle.id;
          displayName = `${String(vehicle.brand || "").trim()} ${String(vehicle.model || "").trim()}`.trim();
          break;
        }
      }

      const updates = [];
      const replacements = { id: lead.id };
      if (cleaned !== String(lead.interestedIn || "").trim().replace(/\s+/g, " ")) {
        updates.push("interested_in = :interestedIn");
        replacements.interestedIn = displayName || cleaned;
      } else if (matchedId && displayName && displayName !== cleaned) {
        updates.push("interested_in = :interestedIn");
        replacements.interestedIn = displayName;
      }
      if (matchedId) {
        updates.push("interested_vehicle_id = :vehicleId");
        replacements.vehicleId = matchedId;
      }
      if (!updates.length) continue;
      await queryInterface.sequelize.query(`UPDATE client_leads SET ${updates.join(", ")} WHERE id = :id`, {
        replacements,
      });
    }
  },

  async down(queryInterface) {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect !== "mysql") return;
    await queryInterface.sequelize.query("ALTER TABLE client_leads DROP COLUMN interested_vehicle_id");
  },
};
