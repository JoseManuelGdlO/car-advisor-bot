import crypto from "crypto";
import { env } from "../config/env.js";
import { sha256 } from "./auth.js";
import { ServiceToken } from "../models/index.js";

const PLATFORM_BOT_SCOPES = ["platform:bot"];

/**
 * Compara token plano con el secret de env usando timing-safe equal (hash si longitudes difieren).
 */
export function matchesBackendServiceToken(token) {
  const configured = String(env.service?.backendServiceToken || "").trim();
  if (!configured || !token) return false;
  const a = Buffer.from(sha256(token), "utf8");
  const b = Buffer.from(sha256(configured), "utf8");
  return crypto.timingSafeEqual(a, b);
}

/**
 * Autentica Bearer como token global de plataforma (BACKEND_SERVICE_TOKEN en env).
 */
export function authAsPlatformService() {
  return {
    type: "service",
    scope: "platform",
    userId: null,
    scopes: PLATFORM_BOT_SCOPES,
  };
}

/**
 * Autentica Bearer contra service_tokens en DB (legacy por tenant).
 */
export async function authAsTenantService(token) {
  const record = await ServiceToken.findOne({
    where: { tokenHash: sha256(token), revokedAt: null },
  });
  if (!record) return null;
  await record.update({ lastUsedAt: new Date() });
  return {
    type: "service",
    scope: "tenant",
    userId: record.ownerUserId,
    scopes: record.scopes || [],
  };
}

/**
 * Resuelve auth de servicio: primero token global env, luego DB.
 */
export async function resolveServiceAuth(token) {
  if (matchesBackendServiceToken(token)) {
    return authAsPlatformService();
  }
  return authAsTenantService(token);
}
