import { verifyJwt } from "../utils/auth.js";
import { ApiError } from "../utils/errors.js";
import { User } from "../models/index.js";
import { resolveServiceAuth } from "../utils/serviceTokenAuth.js";

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
    req.auth = { type: "user", userId: user.id, email: user.email };
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
      req.auth = { type: "user", userId: user.id, email: user.email };
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
