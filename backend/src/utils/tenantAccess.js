import { ApiError } from "./errors.js";

export const ROLE_ADMIN = "admin";
export const ROLE_SELLER = "seller";

/**
 * Construye el contexto `req.auth` de un usuario JWT.
 * - admin: el tenant es él mismo.
 * - seller: el tenant es el admin que lo creó (`tenantOwnerUserId`).
 */
export const buildUserAuth = (user) => {
  const role = user?.role === ROLE_SELLER ? ROLE_SELLER : ROLE_ADMIN;
  const tenantOwnerUserId = role === ROLE_SELLER ? user.tenantOwnerUserId || null : user.id;
  if (!tenantOwnerUserId) {
    // Vendedor huérfano: no hay tenant al que pertenezca, se trata como sesión inválida.
    throw new ApiError(401, "Invalid user");
  }
  return {
    type: "user",
    userId: user.id,
    email: user.email,
    role,
    tenantOwnerUserId,
  };
};

export const isSellerAuth = (auth) => auth?.type === "user" && auth?.role === ROLE_SELLER;
export const isAdminAuth = (auth) => auth?.type === "user" && !isSellerAuth(auth);

/**
 * Tenant dueño de los recursos compartidos (vehículos, promos, financiamiento, FAQs,
 * bot settings, integraciones, perfil de negocio). Nunca devuelve el id de un vendedor.
 */
export const resolveTenantOwnerId = (req) => {
  const auth = req?.auth;
  if (auth?.type === "user") return auth.tenantOwnerUserId || auth.userId;
  if (auth?.type === "service" && auth?.scope === "tenant" && auth?.userId) return auth.userId;
  throw new ApiError(401, "Unauthorized");
};

/**
 * Filtro Sequelize de leads visibles para el usuario autenticado.
 * - admin: todos los leads del tenant.
 * - seller: solo los asignados a él (los no asignados son solo del admin).
 */
export const leadVisibilityWhere = (auth) => {
  const ownerUserId = auth?.tenantOwnerUserId || auth?.userId;
  if (!ownerUserId) throw new ApiError(401, "Unauthorized");
  if (isSellerAuth(auth)) {
    return { ownerUserId, assignedSellerUserId: auth.userId };
  }
  return { ownerUserId };
};

/** Lanza 403 si el usuario autenticado no es admin del tenant. */
export const assertAdmin = (auth) => {
  if (!isAdminAuth(auth)) {
    throw new ApiError(403, "Solo el administrador puede realizar esta acción.");
  }
};

/** DTO de usuario para login/perfil: incluye rol y tenant para los gates de UI. */
export const toUserSessionDto = (user) => {
  const auth = buildUserAuth(user);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: auth.role,
    tenantOwnerUserId: auth.tenantOwnerUserId,
  };
};
