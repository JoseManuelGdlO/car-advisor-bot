import crypto from "crypto";
import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";

const readRawBody = (req) => {
  if (typeof req.rawBody === "string") return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  return "";
};

/**
 * Comprueba firma X-Hub-Signature-256 (función pura, testeable).
 * @param {{ appSecret: string; rawBody: string; signatureHeader: string }} params
 */
export const isValidMetaInstagramSignature = ({ appSecret, rawBody, signatureHeader }) => {
  const secret = String(appSecret || "").trim();
  if (!secret) return false;
  const header = String(signatureHeader || "").trim();
  if (!header.startsWith("sha256=")) return false;
  const providedHex = header.slice("sha256=".length);
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const left = Buffer.from(providedHex, "hex");
  const right = Buffer.from(expected, "hex");
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

/**
 * Valida X-Hub-Signature-256 (Meta / Instagram) sobre el cuerpo crudo del POST.
 */
export const verifyMetaInstagramSignature = (req, _res, next) => {
  try {
    const secret = String(env.meta.appSecret || "").trim();
    if (!secret) throw new ApiError(503, "Meta app secret not configured");

    const signatureHeader = String(req.headers["x-hub-signature-256"] || "").trim();
    const raw = readRawBody(req);
    if (!isValidMetaInstagramSignature({ appSecret: secret, rawBody: raw, signatureHeader })) {
      throw new ApiError(401, "Invalid webhook signature");
    }

    req.metaInstagram = { ...(req.metaInstagram || {}), signatureVerified: true };
    return next();
  } catch (err) {
    return next(err);
  }
};
