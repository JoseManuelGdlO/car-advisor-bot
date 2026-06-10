import type { ZodIssue } from "zod";
import { ApiRequestError } from "@/lib/api";

export type FormErrorState = {
  formError: string;
  fieldErrors: Record<string, string>;
};

/** Convierte issues de Zod en errores por campo (usa el último segmento del path). */
export function zodIssuesToFieldErrors(issues: ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const iss of issues) {
    const key = iss.path[iss.path.length - 1];
    if (typeof key === "string" && !out[key]) {
      out[key] = iss.message;
    }
  }
  return out;
}

const DEFAULT_JSON_ERROR_MESSAGE = "Revisa los datos del formulario.";

/** Red de seguridad: mensajes Zod serializados como JSON → texto legible. */
export function formatUserFacingMessage(raw: string, fallback = DEFAULT_JSON_ERROR_MESSAGE): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (!trimmed.startsWith("[")) return trimmed;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return fallback;

    const messages = parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const msg = (item as { message?: unknown }).message;
        return typeof msg === "string" ? msg : null;
      })
      .filter((msg): msg is string => Boolean(msg));

    if (messages.length === 1) return messages[0];
    if (messages.length > 1) return DEFAULT_JSON_ERROR_MESSAGE;
    return fallback;
  } catch {
    return fallback;
  }
}

function normalizeFieldErrorKeys(fieldErrors: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fieldErrors)) {
    const normalized = key.includes(".") ? (key.split(".").pop() ?? key) : key;
    if (!out[normalized]) out[normalized] = value;
  }
  return out;
}

/** Separa mensaje global y errores por campo a partir de ApiRequestError. */
export function splitApiRequestError(
  err: ApiRequestError,
  options?: { knownFields?: Iterable<string> },
): FormErrorState {
  const fieldErrors = normalizeFieldErrorKeys({ ...err.fieldErrors });
  const formFromPayload = fieldErrors._form;
  delete fieldErrors._form;

  const message = formatUserFacingMessage(err.message);
  const keys = Object.keys(fieldErrors);
  const known = options?.knownFields ? new Set(options.knownFields) : null;
  const onlyKnownFields = Boolean(known && keys.length > 0 && keys.every((k) => known.has(k)));

  let formError = "";
  if (formFromPayload) {
    formError = formFromPayload;
  } else if (keys.length === 0) {
    formError = message;
  } else if (known && !onlyKnownFields) {
    formError = message;
  } else if (!known && keys.length > 1 && message) {
    formError = message;
  }

  return { formError, fieldErrors };
}

/** Normaliza cualquier error de formulario/API a estado usable en UI. */
export function normalizeApiError(err: unknown, fallback: string, options?: { knownFields?: Iterable<string> }): FormErrorState {
  if (ApiRequestError.is(err)) {
    return splitApiRequestError(err, options);
  }
  if (err instanceof Error) {
    const msg = formatUserFacingMessage(err.message, fallback);
    return { formError: msg || fallback, fieldErrors: {} };
  }
  return { formError: fallback, fieldErrors: {} };
}
