import { verifyJwt } from "../utils/auth.js";
import { ApiError } from "../utils/errors.js";
import { User } from "../models/index.js";
import { resolveServiceAuth } from "../utils/serviceTokenAuth.js";
import { buildUserAuth, isAdminAuth } from "../utils/tenantAccess.js";

// Extrae token Authorization: Bearer <token>.
const getBearer = (header = "") => header.replace(/^Bearer\s+/i, "").trim();

export const requireUserAuth = async (req, _res, next) => {
  try {
    // 1) valida presencia de token.
    const token = getBearer(req.headers.authorization);
    if (!token) throw new ApiError(401, "Missing token");
    // 2) valida JWT y resuelve usuario activo.
    const payload = verifyJwt(token);
    const user = await User.findByPk(payload.sub);
    if (!user || !user.active) throw new ApiError(401, "Invalid user");
    // 3) inyecta contexto auth para capas posteriores.
    req.auth = buildUserAuth(user);
    return next();
  } catch (_err) {
    return next(new ApiError(401, "Unauthorized"));
  }
};

export const requireServiceToken = async (req, _res, next) => {
  try {
    const token = getBearer(req.headers.authorization);
    if (!token) throw new ApiError(401, "Missing service token");
    const auth = await resolveServiceAuth(token);
    if (!auth) throw new ApiError(401, "Invalid service token");
    req.auth = auth;
    return next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    return next(new ApiError(401, "Unauthorized service token"));
  }
};

export const requireUserOrServiceAuth = async (req, res, next) => {
  // Estrategia fallback: primero JWT de usuario, luego service token.
  const token = getBearer(req.headers.authorization);
  if (!token) {
    return next(new ApiError(401, "Missing token"));
  }

  try {
    // Camino A: autenticación por usuario final.
    const payload = verifyJwt(token);
    const user = await User.findByPk(payload.sub);
    if (user && user.active) {
      req.auth = buildUserAuth(user);
      return next();
    }
  } catch (_err) {
    // Token no valido como JWT de usuario; intentamos service token.
  }

  try {
    const auth = await resolveServiceAuth(token);
    if (!auth) throw new ApiError(401, "Invalid service token");
    req.auth = auth;
    return next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    return next(new ApiError(401, "Unauthorized"));
  }
};

// Gate: solo admin del tenant (los vendedores reciben 403). Debe ir después de requireUserAuth.
export const requireAdmin = (req, _res, next) => {
  if (!isAdminAuth(req.auth)) {
    return next(new ApiError(403, "Solo el administrador puede realizar esta acción."));
  }
  return next();
};

// Gate para rutas compartidas con el bot: admin de usuario o cualquier service token.
export const requireAdminOrService = (req, _res, next) => {
  if (req.auth?.type === "service" || isAdminAuth(req.auth)) return next();
  return next(new ApiError(403, "Solo el administrador puede realizar esta acción."));
};
