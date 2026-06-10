/**
 * Convierte issues de Zod en mensajes en español y cuerpo de respuesta HTTP uniforme.
 * @param {Array<import("zod").core.$ZodIssue>} issues
 * @returns {{ message: string, errors: Array<{ path: (string|number)[], message: string }> }}
 */
export function formatZodIssues(issues) {
  const errors = issues.map((issue) => ({
    path: Array.isArray(issue.path) ? [...issue.path] : [],
    message: zodIssueToSpanishMessage(issue),
  }));

  const message =
    errors.length === 1 ? errors[0].message : "Revisa los datos del formulario.";

  return { message, errors };
}

const FIELD_LABELS = {
  calendarSchedulingUrl: "link de calendario",
  name: "nombre",
  email: "correo electrónico",
  password: "contraseña",
  phone: "teléfono",
  tradeName: "nombre comercial",
  legalName: "razón social",
  taxId: "NIT / ID fiscal",
  businessPhone: "teléfono del negocio",
  businessEmail: "email del negocio",
  website: "sitio web",
  addressLine: "dirección",
  city: "ciudad",
  state: "estado / departamento",
  country: "país",
  description: "descripción",
  logoUrl: "URL del logo",
};

/** @param {string | null | undefined} field */
function fieldLabel(field) {
  if (!field || typeof field !== "string") return "campo";
  return FIELD_LABELS[field] || field;
}

/** @param {import("zod").core.$ZodIssue} issue */
function zodIssueToSpanishMessage(issue) {
  const path = Array.isArray(issue.path) ? issue.path : [];
  const field = path.length > 0 ? path[path.length - 1] : null;
  const code = issue.code;

  if (code === "unrecognized_keys" && Array.isArray(issue.keys) && issue.keys.length > 0) {
    const labels = issue.keys.map((key) => fieldLabel(String(key)));
    if (labels.length === 1) {
      return `El campo "${labels[0]}" no es válido.`;
    }
    return `Los campos ${labels.map((l) => `"${l}"`).join(", ")} no son válidos.`;
  }

  if (code === "invalid_type" && typeof issue.message === "string") {
    const missing = issue.message.includes("received undefined");
    if (missing) {
      if (field === "password") return "La contraseña es obligatoria.";
      if (field === "name") return "El nombre es obligatorio.";
      if (field === "email") return "El correo electrónico es obligatorio.";
      return "Este campo es obligatorio.";
    }
    return "El tipo de dato no es válido.";
  }

  if (code === "too_small" && issue.origin === "string") {
    const min = issue.minimum;
    if (field === "password") {
      return `La contraseña debe tener al menos ${min} caracteres.`;
    }
    if (field === "name") {
      return `El nombre debe tener al menos ${min} caracteres.`;
    }
    if (field === "email") {
      return `El correo debe tener al menos ${min} caracteres.`;
    }
    return `Debe tener al menos ${min} caracteres.`;
  }

  if (code === "too_big" && issue.origin === "string") {
    const max = issue.maximum;
    if (field === "password") {
      return `La contraseña no puede superar ${max} caracteres.`;
    }
    if (field === "name") {
      return `El nombre no puede superar ${max} caracteres.`;
    }
    return `No puede superar ${max} caracteres.`;
  }

  if (code === "invalid_format" && issue.format === "email") {
    return "Introduce un correo electrónico válido.";
  }

  if (code === "invalid_format") {
    return "El formato del valor no es válido.";
  }

  return "Valor no válido.";
}
