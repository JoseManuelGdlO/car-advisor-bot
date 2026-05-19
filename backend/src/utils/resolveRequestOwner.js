import { z } from "zod";
import { env } from "../config/env.js";
import { ApiError } from "./errors.js";

const uuidSchema = z.string().uuid();

const assertTenantServiceOwnsExplicitOwner = (req, explicitOwnerId) => {
  if (req.auth?.type !== "service" || req.auth?.scope !== "tenant") return;
  if (explicitOwnerId !== req.auth.userId) {
    throw new ApiError(403, "Service token cannot access another owner's data");
  }
};

/**
 * Resuelve el owner (tenant) de la operación según auth y body/query explícitos.
 */
export function resolveRequestOwner(req, { bodyField, queryField } = {}) {
  const fromBody = bodyField ? req.body?.[bodyField] : undefined;
  const fromQuery = queryField ? req.query?.[queryField] : undefined;
  const explicit = String(fromBody ?? fromQuery ?? "").trim();

  if (req.auth?.type === "user") {
    return req.auth.userId;
  }

  if (req.auth?.type === "service" && req.auth?.scope === "tenant") {
    if (!req.auth.userId) {
      throw new ApiError(400, "ownerUserId is required");
    }
    if (explicit) {
      const parsed = uuidSchema.parse(explicit);
      assertTenantServiceOwnsExplicitOwner(req, parsed);
      return parsed;
    }
    return req.auth.userId;
  }

  if (req.auth?.type === "service" && req.auth?.scope === "platform") {
    if (!explicit && env.nodeEnv === "development" && env.bot.defaultOwnerUserId) {
      return env.bot.defaultOwnerUserId;
    }
    if (!explicit) {
      throw new ApiError(400, "ownerUserId is required for platform service auth");
    }
    return uuidSchema.parse(explicit);
  }

  throw new ApiError(401, "Unauthorized");
}
