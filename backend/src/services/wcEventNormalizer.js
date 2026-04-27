import { ApiError } from "../utils/errors.js";

const toIsoOrNow = (value) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
};

const readText = (payload) =>
  String(payload?.message?.text || payload?.data?.message?.text || payload?.text || payload?.body?.text || "").trim();

const readDeviceId = (payload) => String(payload?.deviceId || payload?.device?.id || payload?.data?.deviceId || "").trim();

const readEventType = (payload) => String(payload?.event || payload?.eventType || payload?.type || "").trim().toLowerCase();

export const normalizeWcInboundEvent = ({ payload, integration, credentials }) => {
  // Mapea payload externo de proveedor al contrato interno canónico del backend.
  const eventType = readEventType(payload);
  const eventId = String(payload?.eventId || payload?.id || payload?.data?.eventId || "").trim();
  const messageId = String(payload?.message?.id || payload?.data?.message?.id || "").trim() || null;
  const externalUserId = String(payload?.from || payload?.message?.from || payload?.data?.from || "").trim();
  const text = readText(payload);
  const deviceId = readDeviceId(payload) || String(credentials?.deviceId || "").trim();

  if (!eventId) throw new ApiError(400, "Missing provider event id");
  if (!externalUserId) throw new ApiError(400, "Missing external user id");
  if (!deviceId) throw new ApiError(400, "Missing device id");

  return {
    provider: "whatsapp-connect",
    channel: "whatsapp",
    integrationId: integration.id,
    ownerUserId: integration.ownerUserId,
    externalUserId,
    tenantId: credentials?.tenantId || null,
    deviceId,
    eventId,
    messageId,
    occurredAt: toIsoOrNow(payload?.timestamp || payload?.createdAt || payload?.data?.timestamp),
    direction: "inbound",
    eventType,
    text,
    media: payload?.message?.media || payload?.data?.message?.media || null,
    raw: payload,
    isInboundMessage: eventType === "message.inbound" || eventType === "message_received",
  };
};
