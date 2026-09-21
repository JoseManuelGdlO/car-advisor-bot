import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import { parseGraphErrorPayload, toMetaErrorMeta, userFacingMetaCodeMessage } from "../utils/metaError.js";
import { formatWhatsappGraphTo } from "../utils/whatsappIdentity.js";

const quietTest = process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);

function logMetaSendError(fields) {
  if (quietTest) return;
  console.error("[meta-whatsapp] Graph messages error", fields);
}

const graphMessagesUrl = (phoneNumberId) => {
  const version = String(env.meta.graphApiVersion || "v21.0").replace(/^\/+|\/+$/g, "");
  const id = String(phoneNumberId || "").trim();
  return `https://graph.facebook.com/${version}/${encodeURIComponent(id)}/messages`;
};

const requirePhone = (to) => {
  const phone = formatWhatsappGraphTo(to);
  if (!phone) throw new ApiError(400, "Teléfono de WhatsApp inválido.");
  return phone;
};

const requireAuth = ({ phoneNumberId, accessToken }) => {
  const phoneId = String(phoneNumberId || "").trim();
  const token = String(accessToken || "").trim();
  if (!phoneId || !token) throw new ApiError(400, "Faltan credenciales de WhatsApp (Meta).");
  return { phoneId, token };
};

const parseResponseBody = async (response) => {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { error: { message: raw.slice(0, 300) } };
  }
};

const graphSend = async ({ phoneNumberId, accessToken, body }) => {
  const { phoneId, token } = requireAuth({ phoneNumberId, accessToken });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env.meta.timeoutMs || 8000));
  try {
    const response = await fetch(graphMessagesUrl(phoneId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await parseResponseBody(response);
    if (!response.ok) {
      const details = parseGraphErrorPayload(payload, response.status);
      const status = details.httpStatus >= 400 && details.httpStatus < 600 ? details.httpStatus : 502;
      const err = new ApiError(status, userFacingMetaCodeMessage(details.code, details.message));
      err.meta = toMetaErrorMeta(details, { httpStatus: status, message: err.message });
      logMetaSendError({
        phoneNumberId: phoneId,
        to: body?.to || null,
        kind: body?.type || null,
        ...err.meta,
      });
      throw err;
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === "AbortError") throw new ApiError(504, "La API de WhatsApp (Meta) tardó demasiado.");
    throw new ApiError(502, "No se pudo contactar la API de WhatsApp (Meta).");
  } finally {
    clearTimeout(timeout);
  }
};

export const sendWhatsappWithRetry = async (fn, { maxAttempts = 3, baseDelayMs = 250 } = {}) => {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      const status = Number(error?.status || 0);
      const retryable = status === 429 || status >= 500 || status === 504;
      if (!retryable || attempt >= maxAttempts) throw error;
      const jitter = Math.floor(Math.random() * 100);
      const delay = baseDelayMs * attempt + jitter;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

export const sendWhatsappText = async ({ phoneNumberId, accessToken, to, text }) => {
  const phone = requirePhone(to);
  const bodyText = String(text || "").trim();
  if (!bodyText) throw new ApiError(400, "El texto es obligatorio.");
  return sendWhatsappWithRetry(() =>
    graphSend({
      phoneNumberId,
      accessToken,
      body: {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: bodyText },
      },
    })
  );
};

export const sendWhatsappImage = async ({ phoneNumberId, accessToken, to, imageUrl, caption }) => {
  const phone = requirePhone(to);
  const link = String(imageUrl || "").trim();
  if (!link) throw new ApiError(400, "La URL de la imagen es obligatoria.");
  const captionText = String(caption || "").trim();
  return sendWhatsappWithRetry(() =>
    graphSend({
      phoneNumberId,
      accessToken,
      body: {
        messaging_product: "whatsapp",
        to: phone,
        type: "image",
        image: { link, ...(captionText ? { caption: captionText } : {}) },
      },
    })
  );
};

export const sendWhatsappDocument = async ({ phoneNumberId, accessToken, to, documentUrl, fileName, caption }) => {
  const phone = requirePhone(to);
  const link = String(documentUrl || "").trim();
  const filename = String(fileName || "").trim();
  if (!link) throw new ApiError(400, "La URL del documento es obligatoria.");
  if (!filename) throw new ApiError(400, "El nombre del archivo es obligatorio.");
  const captionText = String(caption || "").trim();
  return sendWhatsappWithRetry(() =>
    graphSend({
      phoneNumberId,
      accessToken,
      body: {
        messaging_product: "whatsapp",
        to: phone,
        type: "document",
        document: { link, filename, ...(captionText ? { caption: captionText } : {}) },
      },
    })
  );
};
