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
const wcFetch = async (path, { method = "GET", token, body } = {}) => {
  ensureConfigured();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.wc.timeoutMs);

  try {
    const response = await fetch(`${env.wc.apiUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      if (err.status === 401) throw new ApiError(401, "WhatsApp Connect unauthorized");
      if (err.status === 403) throw new ApiError(403, "WhatsApp Connect forbidden");
      if (err.status === 404) throw new ApiError(404, "WhatsApp Connect resource not found");
      if (err.status >= 500) throw new ApiError(502, "WhatsApp Connect upstream error");
      throw new ApiError(err.status, err.message || "WhatsApp Connect request failed");
    }
    throw new ApiError(502, "WhatsApp Connect network error");
  } finally {
    clearTimeout(timeout);
  }
};

// Algunos entornos devuelven token en estructuras distintas; soportamos variantes comunes.
const readTokenFromLogin = (payload) => payload?.token || payload?.accessToken || payload?.data?.token || payload?.data?.accessToken;

// Permite trabajar tanto con expiresAt ISO como con expiresIn en segundos.
const readExpiresAtFromLogin = (payload) => {
  const expiresAt = payload?.expiresAt || payload?.data?.expiresAt;
  if (expiresAt) return expiresAt;

  const expiresInSeconds = payload?.expiresIn || payload?.data?.expiresIn;
  if (!expiresInSeconds || Number.isNaN(Number(expiresInSeconds))) return null;
  return new Date(Date.now() + Number(expiresInSeconds) * 1000).toISOString();
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
  // Login de servicio para obtener JWT de WhatsApp Connect.
  async login({ email, password, apiKey } = {}) {
    const resolvedEmail = String(email || env.wc.email || "").trim();
    const resolvedPassword = String(password || env.wc.password || "").trim();
    const resolvedApiKey = String(apiKey || "").trim();
    if (!resolvedApiKey && (!resolvedEmail || !resolvedPassword)) {
      throw new ApiError(500, "WhatsApp Connect credentials are not configured");
    }
    const payload = await wcFetch("/auth/login", {
      method: "POST",
      body: resolvedApiKey ? { apiKey: resolvedApiKey } : { email: resolvedEmail, password: resolvedPassword },
    });
    const token = readTokenFromLogin(payload);
    const expiresAt = readExpiresAtFromLogin(payload);
    if (!token) throw new ApiError(502, "WhatsApp Connect login response invalid");
    return { token, expiresAt };
  },

  // Pone el device en modo de conexion para habilitar QR.
  async connectDevice(deviceId, token) {
    await wcFetch(`/devices/${deviceId}/connect`, { method: "POST", token });
    return { ok: true };
  },

  // Genera URL publica que renderiza el QR para escaneo.
  async createPublicLink(deviceId, token) {
    const payload = await wcFetch(`/devices/${deviceId}/public-link`, { method: "POST", token });
    const url = readPublicLink(payload);
    if (!url) throw new ApiError(502, "WhatsApp Connect public link response invalid");
    return { url, expiresAt: readPublicLinkExpiry(payload) };
  },

  async sendMessage({ deviceId, token, to, type = "text", text, tenantId }) {
    // Wrapper directo al endpoint de salida de mensajes del proveedor.
    const payload = await wcFetch(`/devices/${deviceId}/messages/send`, {
      method: "POST",
      token,
      body: {
        to,
        type,
        text,
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
        const retryable = status === 401 || status === 429 || status >= 500 || status === 504;
        if (!retryable || attempt >= maxAttempts) throw error;
        const jitter = Math.floor(Math.random() * 100);
        const delay = baseDelayMs * attempt + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  },

  async getDeviceStatus({ deviceId, token }) {
    // Consulta estado operativo del device para UX de integración.
    const payload = await wcFetch(`/devices/${deviceId}`, {
      method: "GET",
      token,
    });
    const status = String(payload?.status || payload?.data?.status || "UNKNOWN").toUpperCase();
    return {
      status: ["ONLINE", "OFFLINE"].includes(status) ? status : "UNKNOWN",
      updatedAt: payload?.updatedAt || payload?.data?.updatedAt || new Date().toISOString(),
    };
  },
};
