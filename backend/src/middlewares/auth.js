import { verifyJwt, sha256 } from "../utils/auth.js";
import { ApiError } from "../utils/errors.js";
import { ServiceToken, User } from "../models/index.js";

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
    // 1) busca token plano en header.
    const token = getBearer(req.headers.authorization);
    if (!token) throw new ApiError(401, "Missing service token");
    // 2) compara hash en DB y exige no revocado.
    const record = await ServiceToken.findOne({ where: { tokenHash: sha256(token), revokedAt: null } });
    if (!record) throw new ApiError(401, "Invalid service token");
    // 3) actualiza actividad + setea contexto auth de servicio.
    await record.update({ lastUsedAt: new Date() });
    req.auth = { type: "service", userId: record.ownerUserId, scopes: record.scopes || [] };
    return next();
  } catch (_err) {
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
    // Camino B: autenticación por token de servicio.
    const record = await ServiceToken.findOne({ where: { tokenHash: sha256(token), revokedAt: null } });
    if (!record) throw new ApiError(401, "Invalid service token");
    await record.update({ lastUsedAt: new Date() });
    req.auth = { type: "service", userId: record.ownerUserId, scopes: record.scopes || [] };
    return next();
  } catch (_err) {
    return next(new ApiError(401, "Unauthorized"));
  }
};
