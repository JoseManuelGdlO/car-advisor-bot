import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import { wcClient } from "./wcClient.js";

const tokenCache = new Map();
const loginInflight = new Map();

// Ventana de seguridad para refrescar token antes de que expire.
const refreshMarginMs = () => Math.max(0, Number(env.wc.jwtRefreshMarginSeconds || 300) * 1000);

// Determina si el token actual sigue siendo util para llamadas seguras.
const tokenIsFresh = (entry) => Boolean(entry?.token) && Date.now() < entry.expiresAtMs - refreshMarginMs();

// Guarda token y expiracion; si upstream no reporta expiracion, usa fallback temporal.
const setToken = ({ cacheKey, token, expiresAt }) => {
  tokenCache.set(cacheKey, {
    token,
    expiresAtMs: expiresAt ? Date.parse(expiresAt) : Date.now() + 50 * 60 * 1000,
  });
};

// Se usa cuando upstream responde 401 o cuando se necesita forzar login.
export const invalidateWcTokenCache = (cacheKey = "default") => {
  tokenCache.delete(cacheKey);
};

// Hace login al proveedor y deja token listo en memoria.
const loginAndCache = async ({ cacheKey, loginArgs }) => {
  // Evita múltiples logins concurrentes para la misma cuenta/proveedor.
  if (loginInflight.has(cacheKey)) return loginInflight.get(cacheKey);
  const promise = wcClient
    .login(loginArgs)
    .then((auth) => {
      setToken({ cacheKey, ...auth });
      return auth.token;
    })
    .finally(() => loginInflight.delete(cacheKey));
  loginInflight.set(cacheKey, promise);
  const token = await promise;
  return token;
};

// Obtiene token cacheado o nuevo segun expiracion/forzado.
export const getWcToken = async ({ forceRefresh = false, cacheKey = "default", loginArgs } = {}) => {
  const entry = tokenCache.get(cacheKey);
  if (!forceRefresh && tokenIsFresh(entry)) return entry.token;
  return loginAndCache({ cacheKey, loginArgs });
};

// Ejecuta una operacion con token y reintenta 1 vez si recibe 401.
export const runWithWcToken = async (callback, { cacheKey = "default", loginArgs } = {}) => {
  // Retry automático una vez cuando el upstream invalida credenciales (401).
  let token = await getWcToken({ cacheKey, loginArgs });
  try {
    return await callback(token);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    invalidateWcTokenCache(cacheKey);
    token = await getWcToken({ forceRefresh: true, cacheKey, loginArgs });
    return callback(token);
  }
};
