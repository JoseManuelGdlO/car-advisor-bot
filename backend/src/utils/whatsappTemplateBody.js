import crypto from "node:crypto";
import { ApiError } from "./errors.js";

export const META_BODY_MAX_LENGTH = 1024;
export const TEMPLATE_PURPOSE_FOLLOWUP = "followup";
export const TEMPLATE_LANGUAGE = "es_MX";
export const TEMPLATE_CATEGORY = "MARKETING";
export const META_FOLLOWUP_DISPLAY_NAME = "Seguimiento";
export const META_FOLLOWUP_DEFAULT_BODY =
  "Hola, te escribimos de nuevo por si sigues interesado en nuestros vehículos. ¿Te puedo ayudar con algo más?";

const PLACEHOLDER_RE = /\{\{\d+\}\}/;

export function assertTextOnlyTemplateBody(body) {
  const text = String(body || "");
  const trimmed = text.trim();
  if (!trimmed) throw new ApiError(400, "El cuerpo no puede estar vacío.");
  if (text.length > META_BODY_MAX_LENGTH || trimmed.length > META_BODY_MAX_LENGTH) {
    throw new ApiError(400, "El cuerpo no puede superar 1024 caracteres.");
  }
  if (PLACEHOLDER_RE.test(trimmed)) {
    throw new ApiError(400, "Esta plantilla es solo texto. No uses variables como {{1}}.");
  }
  return trimmed;
}

export function buildTextOnlyBodyComponents(body) {
  return [{ type: "BODY", text: assertTextOnlyTemplateBody(body) }];
}

export function bodyTextFromComponents(components) {
  const list = Array.isArray(components) ? components : [];
  const body = list.find((c) => String(c?.type || "").toUpperCase() === "BODY");
  return String(body?.text || "").trim();
}

export const FOLLOWUP_TEMPLATE_NAME_PREFIX = "cab_sg_";

export function isFollowupTemplateName(name) {
  return String(name || "").startsWith(FOLLOWUP_TEMPLATE_NAME_PREFIX);
}

export function generateFollowupTemplateName() {
  return `${FOLLOWUP_TEMPLATE_NAME_PREFIX}${crypto.randomBytes(4).toString("hex")}`;
}
