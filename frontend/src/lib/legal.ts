export const LEGAL_COMPANY = "AutoBot";
export const LEGAL_CONTACT_EMAIL = "direccion@intelekia.cloud";
export const LEGAL_UPDATED_AT = "22 de septiembre de 2026";

export const LEGAL_DELETION_MAILTO = `mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent(
  `Solicitud de eliminación de datos — ${LEGAL_COMPANY}`,
)}`;

export const LEGAL_PAGES = [
  {
    path: "/privacidad",
    label: "Política de privacidad",
    hint: "Recopilación y uso de datos",
  },
  {
    path: "/terminos",
    label: "Condiciones del servicio",
    hint: "Términos del SaaS",
  },
  {
    path: "/eliminar-datos",
    label: "Eliminación de datos",
    hint: "Borrado de cuenta y datos",
  },
] as const;

export const LEGAL_PUBLIC_PATHS = LEGAL_PAGES.map((page) => page.path);

export function isLegalPublicPath(pathname: string) {
  return LEGAL_PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
