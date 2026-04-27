import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import { wcClient } from "./wcClient.js";

let cachedToken = null;
let expiresAtMs = 0;

// Ventana de seguridad para refrescar token antes de que expire.
const refreshMarginMs = () => Math.max(0, Number(env.wc.jwtRefreshMarginSeconds || 300) * 1000);

// Determina si el token actual sigue siendo util para llamadas seguras.
const tokenIsFresh = () => Boolean(cachedToken) && Date.now() < expiresAtMs - refreshMarginMs();

// Guarda token y expiracion; si upstream no reporta expiracion, usa fallback temporal.
const setToken = ({ token, expiresAt }) => {
  cachedToken = token;
  expiresAtMs = expiresAt ? Date.parse(expiresAt) : Date.now() + 50 * 60 * 1000;
};

// Se usa cuando upstream responde 401 o cuando se necesita forzar login.
export const invalidateWcTokenCache = () => {
  cachedToken = null;
  expiresAtMs = 0;
};

// Hace login al proveedor y deja token listo en memoria.
const loginAndCache = async () => {
  const auth = await wcClient.login();
  setToken(auth);
  return auth.token;
};

// Obtiene token cacheado o nuevo segun expiracion/forzado.
export const getWcToken = async ({ forceRefresh = false } = {}) => {
  if (!forceRefresh && tokenIsFresh()) return cachedToken;
  return loginAndCache();
};

// Ejecuta una operacion con token y reintenta 1 vez si recibe 401.
export const runWithWcToken = async (callback) => {
  let token = await getWcToken();
  try {
    return await callback(token);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    invalidateWcTokenCache();
    token = await getWcToken({ forceRefresh: true });
    return callback(token);
  }
};
