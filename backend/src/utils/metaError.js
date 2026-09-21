function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function trimOrNull(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  return text || null;
}

/** Normaliza un error de Graph / webhook de Cloud API (code, details, fbtrace). */
export function summarizeMetaError(errorLike = {}) {
  const nested = asObject(errorLike).error;
  const err = nested && typeof nested === "object" ? nested : asObject(errorLike);
  const errorData = asObject(err.error_data);
  const codeRaw = err.code;
  const code = codeRaw == null || codeRaw === "" ? null : Number.isFinite(Number(codeRaw)) ? Number(codeRaw) : codeRaw;
  return {
    code,
    subcode: err.error_subcode ?? err.subcode ?? null,
    type: trimOrNull(err.type),
    title: trimOrNull(err.title || err.error_user_title),
    message: trimOrNull(err.message || err.error_user_msg),
    details: trimOrNull(errorData.details || err.details),
    fbtraceId: trimOrNull(err.fbtrace_id || err.fbtraceId),
    href: trimOrNull(err.href),
  };
}

export function summarizeMetaErrors(errors = []) {
  if (!Array.isArray(errors)) return [];
  return errors.map((item) => summarizeMetaError(item)).filter((row) =>
    row.code != null || row.message || row.title || row.details,
  );
}

const META_CODE_MESSAGES = {
  190: "El token de WhatsApp ya no es válido. Vuelve a conectar la cuenta.",
  100: "La solicitud a Meta fue rechazada. Revisa la configuración de la app.",
  10: "La app de Meta no tiene el permiso necesario.",
  33: "No se encontró el recurso de WhatsApp en Meta.",
  131000: "WhatsApp no pudo enviar el mensaje. Inténtalo de nuevo.",
  131026: "El número de destino no es un WhatsApp válido.",
  131042: "Hay un problema de facturación en tu cuenta de WhatsApp Business. Configura el país y la moneda en Meta Business Manager.",
  131047: "Han pasado más de 24 horas. Debes usar una plantilla aprobada.",
  131051: "El tipo de mensaje no está soportado.",
  132000: "La plantilla de WhatsApp fue rechazada o no existe.",
  132001: "La plantilla no está disponible en este idioma.",
  133010: "El número de WhatsApp no está registrado en Cloud API.",
};

export function userFacingMetaCodeMessage(code, fallback) {
  return META_CODE_MESSAGES[Number(code)] || fallback || "Error de la API de WhatsApp (Meta).";
}

export function parseGraphErrorPayload(payload = {}, httpStatus = 500) {
  const error = payload?.error && typeof payload.error === "object" ? payload.error : {};
  return {
    httpStatus,
    code: error.code ?? error.error_code ?? null,
    subcode: error.error_subcode ?? error.error_user_title ?? null,
    message: String(error.message || error.error_user_msg || payload?.error || "Error de Graph API").trim(),
    fbtraceId: error.fbtrace_id || error.fbtraceId || null,
  };
}
