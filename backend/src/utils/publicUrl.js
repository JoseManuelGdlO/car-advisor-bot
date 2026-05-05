import { URL } from "node:url";

const stripTrailingSlash = (value) => String(value || "").replace(/\/+$/g, "");

const resolvePublicBaseUrl = (fallbackBase) => {
  const backendPublic = stripTrailingSlash(process.env.BACKEND_PUBLIC_URL);
  if (backendPublic) return backendPublic;

  const backendApi = String(process.env.BACKEND_API_URL || "").trim();
  if (backendApi) {
    try {
      const u = new URL(backendApi);
      u.search = "";
      u.hash = "";
      u.pathname = (u.pathname || "").replace(/\/api\/?$/i, "") || "/";
      return stripTrailingSlash(u.toString());
    } catch {
      // Si la URL es inválida, continuamos con el siguiente fallback.
    }
  }

  if (fallbackBase) return stripTrailingSlash(fallbackBase);
  return "";
};

export const normalizePublicImageUrl = (rawUrl, { fallbackBase } = {}) => {
  const cleaned = String(rawUrl || "").trim();
  if (!cleaned) return "";
  if (/^https?:\/\//i.test(cleaned)) return cleaned;

  const base = resolvePublicBaseUrl(fallbackBase);
  if (!base) return cleaned;

  if (cleaned.startsWith("/")) return `${base}${cleaned}`;
  return `${base}/${cleaned}`;
};

