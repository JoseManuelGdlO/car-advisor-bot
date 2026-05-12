const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Error HTTP del API con mensaje y, opcionalmente, errores por campo (`path[0]` del backend). */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, status: number, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  static is(err: unknown): err is ApiRequestError {
    return err instanceof ApiRequestError;
  }
}

function parseFieldErrorsFromPayload(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object") return {};
  const raw = (payload as { errors?: unknown }).errors;
  if (!Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const path = (item as { path?: unknown }).path;
    const msg = (item as { message?: unknown }).message;
    if (typeof msg !== "string") continue;
    const key =
      Array.isArray(path) && path.length > 0 && typeof path[0] === "string" ? path[0] : "_form";
    if (!out[key]) out[key] = msg;
  }
  return out;
}

function errorMessageFromPayload(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && typeof (payload as { message?: unknown }).message === "string") {
    return (payload as { message: string }).message;
  }
  return fallback;
}

/** Registrado desde AuthProvider: sesión inválida o JWT expirado (401 con Bearer). */
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function notifySessionExpired(status: number, hadAuthHeader: boolean): void {
  if (status !== 401 || !hadAuthHeader) return;
  try {
    unauthorizedHandler?.();
  } catch {
    // no bloquear el flujo de error HTTP si el handler falla
  }
}

async function rejectFailedResponse(res: Response, hadAuthHeader: boolean): Promise<never> {
  const payload = await res.json().catch(() => ({ message: "No se pudo completar la solicitud." }));
  notifySessionExpired(res.status, hadAuthHeader);
  const message = errorMessageFromPayload(payload, "No se pudo completar la solicitud.");
  const fieldErrors = parseFieldErrorsFromPayload(payload);
  throw new ApiRequestError(message, res.status, fieldErrors);
}

export async function apiRequest<T>(path: string, method: HttpMethod = "GET", body?: unknown, token?: string): Promise<T> {
  const hadAuthHeader = Boolean(token);
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    return rejectFailedResponse(res, hadAuthHeader);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export async function apiRequestFormData<T>(path: string, body: FormData, token?: string): Promise<T> {
  const hadAuthHeader = Boolean(token);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
  if (!res.ok) {
    return rejectFailedResponse(res, hadAuthHeader);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}
