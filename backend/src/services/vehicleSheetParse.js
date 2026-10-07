import { extractText, getDocumentProxy } from "unpdf";

const FIELD_LIMITS = {
  brand: 80,
  model: 80,
  engine: 80,
  color: 80,
  transmission: 40,
};
const DESCRIPTION_LIMIT = 4000;

const clip = (value, limit) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.slice(0, limit);
};

const optionalInt = (value) => {
  if (typeof value === "boolean" || value == null || value === "") return null;
  const number = Number(String(value).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(number)) return null;
  return Math.round(number);
};

const sanitizeMetadata = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const cleaned = {};
  for (const [key, value] of Object.entries(raw)) {
    const label = String(key || "").trim().slice(0, 80);
    if (!label || value == null) continue;
    if (typeof value === "boolean") {
      cleaned[label] = value;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      cleaned[label] = value;
      continue;
    }
    if (typeof value === "string") {
      const text = value.trim().slice(0, 200);
      if (text) cleaned[label] = text;
      continue;
    }
    if (Array.isArray(value)) {
      const text = value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .join(", ")
        .slice(0, 200);
      if (text) cleaned[label] = text;
    }
  }
  return cleaned;
};

const toPdfBytes = (buffer) => {
  // pdf.js rechaza Buffer aunque herede de Uint8Array.
  if (Buffer.isBuffer(buffer)) return Uint8Array.from(buffer);
  if (buffer instanceof Uint8Array) return new Uint8Array(buffer);
  return new Uint8Array(buffer);
};

export async function extractPdfText(buffer) {
  const bytes = toPdfBytes(buffer);
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  if (Array.isArray(text)) return text.join("\n");
  return String(text || "");
}

export function normalizeVehicleSheet(raw = {}) {
  const year = optionalInt(raw.year);
  const price = optionalInt(raw.price);
  const km = optionalInt(raw.km);
  return {
    brand: clip(raw.brand, FIELD_LIMITS.brand),
    model: clip(raw.model, FIELD_LIMITS.model),
    year: year != null && year >= 1900 && year <= 2100 ? year : null,
    price: price != null && price > 0 ? price : null,
    km: km != null && km >= 0 ? km : 0,
    transmission: clip(raw.transmission, FIELD_LIMITS.transmission),
    engine: clip(raw.engine, FIELD_LIMITS.engine),
    color: clip(raw.color, FIELD_LIMITS.color),
    description: clip(raw.description, DESCRIPTION_LIMIT),
    metadata: sanitizeMetadata(raw.metadata),
  };
}
