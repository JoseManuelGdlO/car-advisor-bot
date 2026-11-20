export type UserRole = "admin" | "seller";

type RoleSource = { role?: string | null } | null | undefined;

/** Sesiones antiguas (sin `role`) se tratan como admin: el backend siempre valida el permiso real. */
export const resolveUserRole = (user: RoleSource): UserRole => (user?.role === "seller" ? "seller" : "admin");

export const isSellerUser = (user: RoleSource): boolean => resolveUserRole(user) === "seller";
export const isAdminUser = (user: RoleSource): boolean => resolveUserRole(user) === "admin";

/** Rutas que solo puede abrir un admin (el vendedor es redirigido). */
const ADMIN_ONLY_PREFIXES = [
  "/vendedores",
  "/config/faqs",
  "/config/bot",
  "/config/comportamiento-bot",
  "/perfil/integraciones",
] as const;

export const isAdminOnlyPath = (pathname: string): boolean =>
  ADMIN_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

export const canAccessPath = (user: RoleSource, pathname: string): boolean =>
  isAdminUser(user) || !isAdminOnlyPath(pathname);

/** Destino al que se redirige a un vendedor que intenta abrir una ruta de admin. */
export const SELLER_FALLBACK_PATH = "/config";
