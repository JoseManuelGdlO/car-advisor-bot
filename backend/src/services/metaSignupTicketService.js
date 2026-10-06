import crypto from "node:crypto";
import { Op } from "sequelize";
import { MetaSignupTicket } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { sha256 } from "../utils/auth.js";
import {
  completeEmbeddedSignup as completeEmbeddedSignupDefault,
  publicMetaSignupConfig,
} from "./metaSignupService.js";

export const SIGNUP_TICKET_TTL_MS = 10 * 60 * 1000;
export const SIGNUP_APP_SCHEME = "autobot";

export const SIGNUP_TICKET_USED_MESSAGE = "Este enlace de conexión ya se usó o venció.";
export const SIGNUP_TICKET_MISSING_URL_MESSAGE = "Falta BACKEND_PUBLIC_URL en el servidor.";
export const SIGNUP_TICKET_NOT_CONFIGURED_MESSAGE = "Embedded Signup no está configurado en el servidor.";
export const SIGNUP_TICKET_WABA_MESSAGE = "Meta no devolvió el WABA ID. Completa de nuevo el flujo.";
export const SIGNUP_TICKET_SUCCESS_MESSAGE = "WhatsApp conectado.";
export const SIGNUP_TICKET_CANCEL_MESSAGE = "Se canceló la conexión de WhatsApp.";
export const SIGNUP_TICKET_FAILED_MESSAGE = "No se pudo conectar WhatsApp.";
export const SIGNUP_TICKET_PENDING_MESSAGE = "Esperando que termines la conexión con Facebook.";
export const SIGNUP_TICKET_EXPIRED_MESSAGE = "El enlace de conexión venció. Inténtalo de nuevo.";
export const SIGNUP_TICKET_NOT_FOUND_MESSAGE = "No encontramos esa conexión.";

export function resolveBackendPublicUrl() {
  return String(process.env.BACKEND_PUBLIC_URL || "").trim().replace(/\/+$/, "");
}

export function buildSignupUrl(ticket) {
  const base = resolveBackendPublicUrl();
  if (!base) throw new ApiError(503, SIGNUP_TICKET_MISSING_URL_MESSAGE);
  return `${base}/whatsapp-signup?ticket=${encodeURIComponent(ticket)}`;
}

function affectedCount(result) {
  if (Array.isArray(result)) return Number(result[0]) || 0;
  return Number(result) || 0;
}

async function claimTicket(row, patch, now = new Date()) {
  const result = await MetaSignupTicket.update(
    { usedAt: now, ...patch },
    {
      where: {
        id: row.id,
        usedAt: null,
        status: "pending",
        expiresAt: { [Op.gt]: now },
      },
    },
  );
  return affectedCount(result) > 0;
}

async function findTicketByValue(ticket) {
  const value = String(ticket || "").trim();
  if (!value) return null;
  return MetaSignupTicket.findOne({ where: { ticketHash: sha256(value) } });
}

export async function createMetaSignupTicket(ownerUserId) {
  const config = publicMetaSignupConfig();
  if (!config.configured) throw new ApiError(503, SIGNUP_TICKET_NOT_CONFIGURED_MESSAGE);
  const ticket = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SIGNUP_TICKET_TTL_MS);
  const signupUrl = buildSignupUrl(ticket);
  await MetaSignupTicket.create({
    userId: ownerUserId,
    ticketHash: sha256(ticket),
    status: "pending",
    expiresAt,
    usedAt: null,
    errorMessage: null,
  });
  return { ticket, expiresAt: expiresAt.toISOString(), signupUrl };
}

function publicErrorMessage(error) {
  const raw = error instanceof ApiError && error.message ? error.message : SIGNUP_TICKET_FAILED_MESSAGE;
  const cleaned = String(raw).replace(/EAA[A-Za-z0-9]+/g, "").replace(/\s+/g, " ").trim();
  return (cleaned || SIGNUP_TICKET_FAILED_MESSAGE).slice(0, 300);
}

export async function completeMetaSignupTicket(input = {}, deps = {}) {
  const row = await findTicketByValue(input.ticket);
  if (!row) throw new ApiError(409, SIGNUP_TICKET_USED_MESSAGE);

  const event = input.event == null ? "" : String(input.event).trim();
  const code = String(input.code || "").trim();
  const wabaId = String(input.wabaId || "").trim();
  const isCancel = event.toUpperCase() === "CANCEL" || !code;

  if (isCancel) {
    const claimed = await claimTicket(row, { status: "cancelled", errorMessage: null });
    if (!claimed) throw new ApiError(409, SIGNUP_TICKET_USED_MESSAGE);
    return { ok: true, status: "cancelled", message: SIGNUP_TICKET_CANCEL_MESSAGE };
  }

  const claimed = await claimTicket(row, {});
  if (!claimed) throw new ApiError(409, SIGNUP_TICKET_USED_MESSAGE);

  const complete = deps.completeEmbeddedSignup || completeEmbeddedSignupDefault;
  try {
    await complete({
      ownerUserId: row.userId,
      code,
      wabaId,
      phoneNumberId: input.phoneNumberId ? String(input.phoneNumberId) : null,
      businessId: input.businessId ? String(input.businessId) : null,
      event: event || null,
    });
    await row.update({ status: "completed", errorMessage: null });
    return { ok: true, status: "completed", message: SIGNUP_TICKET_SUCCESS_MESSAGE };
  } catch (error) {
    const message = publicErrorMessage(error);
    await row.update({ status: "failed", errorMessage: message });
    const status = error instanceof ApiError ? error.status : 502;
    throw new ApiError(status, message);
  }
}

export async function cancelMetaSignupTicket(ticket) {
  return completeMetaSignupTicket({ ticket, event: "CANCEL" });
}

export async function previewSignupTicket(ticket) {
  const row = await findTicketByValue(ticket);
  if (!row) return null;
  if (row.usedAt || row.status !== "pending") return null;
  if (new Date(row.expiresAt).getTime() <= Date.now()) return null;
  return { ok: true };
}

export function signupTicketStatusPayload(row, now = new Date()) {
  if (row.status === "pending" && !row.usedAt && new Date(row.expiresAt).getTime() <= now.getTime()) {
    return { status: "failed", message: SIGNUP_TICKET_EXPIRED_MESSAGE };
  }
  if (row.status === "completed") return { status: "completed", message: SIGNUP_TICKET_SUCCESS_MESSAGE };
  if (row.status === "cancelled") return { status: "cancelled", message: SIGNUP_TICKET_CANCEL_MESSAGE };
  if (row.status === "failed") {
    return { status: "failed", message: row.errorMessage || SIGNUP_TICKET_FAILED_MESSAGE };
  }
  return { status: "pending", message: SIGNUP_TICKET_PENDING_MESSAGE };
}

export async function getMetaSignupTicketStatus({ ownerUserId, ticket }) {
  const row = await findTicketByValue(ticket);
  if (!row || row.userId !== ownerUserId) {
    throw new ApiError(404, SIGNUP_TICKET_NOT_FOUND_MESSAGE);
  }
  return signupTicketStatusPayload(row);
}
