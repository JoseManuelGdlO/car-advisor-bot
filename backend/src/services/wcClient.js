import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";

class WcRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Valida configuracion minima para evitar llamadas a upstream mal formadas.
const ensureConfigured = () => {
  if (!env.wc.apiUrl) {
    throw new ApiError(500, "WhatsApp Connect is not configured");
  }
  if (!env.wc.serviceJwt) {
    throw new ApiError(500, "WC_SERVICE_JWT is required");
  }
};

// Evita romper el flujo si upstream responde texto no-JSON.
const safeJsonParse = (raw) => {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

// Cliente HTTP base para WhatsApp Connect con timeout y mapeo de errores.
const wcFetch = async (path, { method = "GET", body, headers = {} } = {}) => {
  ensureConfigured();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.wc.timeoutMs);
  const authToken = String(env.wc.serviceJwt || "").trim();

  try {
    const response = await fetch(`${env.wc.apiUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        ...(authToken ? { "x-api-key": authToken } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const data = safeJsonParse(text);

    if (!response.ok) {
      const message = data?.message || data?.error || `WC error ${response.status}`;
      throw new WcRequestError(response.status, message);
    }

    return data;
  } catch (err) {
    if (err?.name === "AbortError") throw new ApiError(504, "WhatsApp Connect timeout");
    if (err instanceof WcRequestError) {
      if (err.status === 401 || err.status === 403) {
        console.error("[wc-client] service_jwt_invalid_or_missing_scope", { path, status: err.status });
      }
      if (err.status === 401) throw new ApiError(401, "service_jwt_invalid_or_missing_scope");
      if (err.status === 403) throw new ApiError(403, "service_jwt_invalid_or_missing_scope");
      if (err.status === 404) throw new ApiError(404, "WhatsApp Connect resource not found");
      if (err.status >= 500) throw new ApiError(502, "WhatsApp Connect upstream error");
      throw new ApiError(err.status, err.message || "WhatsApp Connect request failed");
    }
    throw new ApiError(502, "WhatsApp Connect network error");
  } finally {
    clearTimeout(timeout);
  }
};

// Soporta diferentes claves de URL publica retornadas por upstream.
const readPublicLink = (payload) =>
  payload?.url ||
  payload?.publicUrl ||
  payload?.link ||
  payload?.data?.url ||
  payload?.data?.publicUrl ||
  payload?.data?.link;

const readPublicLinkExpiry = (payload) =>
  payload?.expiresAt || payload?.data?.expiresAt || payload?.expires_at || payload?.data?.expires_at || null;

export const wcClient = {
  // Pone el device en modo de conexion para habilitar QR.
  async connectDevice(deviceId) {
    await wcFetch(`/devices/${deviceId}/connect`, { method: "POST" });
    return { ok: true };
  },

  // Genera URL publica que renderiza el QR para escaneo.
  async createPublicLink(deviceId) {
    const payload = await wcFetch(`/devices/${deviceId}/public-link`, { method: "POST" });
    const url = readPublicLink(payload);
    if (!url) throw new ApiError(502, "WhatsApp Connect public link response invalid");
    return { url, expiresAt: readPublicLinkExpiry(payload) };
  },

  async sendMessage({ deviceId, to, type = "text", text, imageUrl, caption, tenantId }) {
    // Wrapper directo al endpoint de salida de mensajes del proveedor.
    const normalizedType = String(type || "text").trim().toLowerCase();
    if (normalizedType === "image" && !String(imageUrl || "").trim()) {
      throw new ApiError(400, "imageUrl is required when type=image");
    }
    if (normalizedType === "text" && !String(text || "").trim()) {
      throw new ApiError(400, "text is required when type=text");
    }

    const messageBody =
      normalizedType === "image"
        ? {
            to,
            type: "image",
            imageUrl: String(imageUrl || "").trim(),
            ...(String(caption || "").trim() ? { caption: String(caption || "").trim() } : {}),
          }
        : {
            to,
            type: "text",
            text: String(text || ""),
          };

    const payload = await wcFetch(`/devices/${deviceId}/messages/send`, {
      method: "POST",
      headers: {
        ...(tenantId ? { "x-tenant-id": String(tenantId) } : {}),
      },
      body: {
        ...messageBody,
        ...(tenantId ? { tenantId } : {}),
      },
    });
    return payload;
  },

  async sendMessageWithRetry(params, { maxAttempts = 3, baseDelayMs = 250 } = {}) {
    // Reintento acotado para errores transitorios de red/auth/rate-limit.
    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        return await wcClient.sendMessage(params);
      } catch (error) {
        const status = Number(error?.status || 0);
        const retryable = status === 429 || status >= 500 || status === 504;
        if (!retryable || attempt >= maxAttempts) throw error;
        const jitter = Math.floor(Math.random() * 100);
        const delay = baseDelayMs * attempt + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  },

  async getDeviceStatus({ deviceId }) {
    // Consulta estado operativo del device para UX de integración.
    const payload = await wcFetch(`/devices/${deviceId}/status`, {
      method: "GET",
    });
    const status = String(payload?.status || payload?.data?.status || "UNKNOWN").toUpperCase();
    return {
      status: ["ONLINE", "OFFLINE"].includes(status) ? status : "UNKNOWN",
      updatedAt: payload?.updatedAt || payload?.data?.updatedAt || new Date().toISOString(),
    };
  },
};
