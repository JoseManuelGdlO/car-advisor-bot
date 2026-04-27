import crypto from "crypto";
import { ApiError } from "../utils/errors.js";
import { logWcWebhook } from "../utils/wcWebhookLog.js";

const toMillis = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (raw.length >= 13) return numeric;
    return numeric * 1000;
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const safeCompareHex = (a, b) => {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

const readRawBody = (req) => {
  if (typeof req.rawBody === "string") return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  return "";
};

export const verifyWcSignature = (req, _res, next) => {
  try {
    // Verifica autenticidad del webhook con HMAC sobre timestamp + rawBody.
    const secret = String(req.wc?.credentials?.webhookSecret || "").trim();
    if (!secret) throw new ApiError(401, "Missing webhook secret");

    const signature = String(req.headers["x-wc-signature"] || req.headers["x-signature"] || "").trim();
    const timestamp = String(req.headers["x-wc-timestamp"] || req.headers["x-timestamp"] || "").trim();

    if (!signature || !timestamp) throw new ApiError(401, "Missing webhook signature headers");

    const payload = `${timestamp}.${readRawBody(req)}`;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (!safeCompareHex(signature, expected)) throw new ApiError(401, "Invalid webhook signature");

    req.wc = {
      ...req.wc,
      signatureVerified: true,
      requestTimestampMs: toMillis(timestamp),
    };
    return next();
  } catch (err) {
    const verifyStatus = err instanceof ApiError ? err.status : 500;
    const verifyMsg = err instanceof Error ? err.message : String(err);
    if (verifyStatus === 401) {
      logWcWebhook("signature verify failed", { message: verifyMsg });
    }
    return next(err);
  }
};
