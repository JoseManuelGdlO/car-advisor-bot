import { Op } from "sequelize";
import { OwnerNotification } from "../models/index.js";
import { ApiError } from "../utils/errors.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KIND_ALIASES = Object.freeze({
  lead: ["lead_interest"],
  advisor: ["human_advisor"],
  escalation: ["human_advisor", "financing_detail_help"],
  inbound: ["new_inbound_message"],
  lead_interest: ["lead_interest"],
  human_advisor: ["human_advisor"],
  financing_detail_help: ["financing_detail_help"],
  new_inbound_message: ["new_inbound_message"],
});

/** Kinds que cuentan en el KPI diario de escalaciones (asesor, financiamiento, cita). */
export const DASHBOARD_ESCALATION_KINDS = Object.freeze([
  "human_advisor",
  "financing_detail_help",
  "lead_interest",
]);

export const resolveKindFilter = (kind) => {
  const normalized = String(kind || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  return KIND_ALIASES[normalized] || [normalized];
};

export const toOwnerNotificationDto = (row) => ({
  id: row.id,
  title: row.title,
  body: row.body,
  kind: row.kind || null,
  conversationId: row.conversationId || null,
  createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  readAt: row.readAt ? new Date(row.readAt).toISOString() : null,
});

const extractConversationId = (data = {}) => {
  const raw = data?.conversationId ?? data?.conversation_id ?? data?.chatId ?? "";
  const value = String(raw || "").trim();
  if (!value || !UUID_RE.test(value)) return null;
  return value;
};

const extractKind = (data = {}) => {
  const value = String(data?.notification_kind ?? data?.notificationKind ?? "").trim();
  return value || null;
};

/**
 * Persiste un aviso in-app para el owner (independiente del envío FCM).
 */
export const createOwnerNotification = async ({ ownerUserId, title, body, data = {} }) => {
  const kind = extractKind(data);
  const conversationId = extractConversationId(data);
  return OwnerNotification.create({
    ownerUserId,
    title: String(title || "").slice(0, 120),
    body: String(body || "").slice(0, 500),
    kind,
    conversationId,
    data: data && typeof data === "object" ? data : null,
    readAt: null,
  });
};

export const countUnreadNotifications = async (ownerUserId) => {
  return OwnerNotification.count({
    where: { ownerUserId, readAt: { [Op.is]: null } },
  });
};

export const listOwnerNotifications = async ({
  ownerUserId,
  kind,
  unreadOnly = false,
  limit = 30,
}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const where = { ownerUserId };

  const kinds = resolveKindFilter(kind);
  if (kinds?.length === 1) {
    where.kind = kinds[0];
  } else if (kinds?.length > 1) {
    where.kind = { [Op.in]: kinds };
  }

  if (unreadOnly) {
    where.readAt = { [Op.is]: null };
  }

  const [rows, unreadCount] = await Promise.all([
    OwnerNotification.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: safeLimit,
    }),
    countUnreadNotifications(ownerUserId),
  ]);

  return {
    items: rows.map(toOwnerNotificationDto),
    unreadCount,
  };
};

export const markOwnerNotificationRead = async ({ ownerUserId, id }) => {
  const row = await OwnerNotification.findOne({ where: { id, ownerUserId } });
  if (!row) throw new ApiError(404, "Notification not found");
  if (!row.readAt) {
    await row.update({ readAt: new Date() });
    await row.reload();
  }
  return toOwnerNotificationDto(row);
};

export const markAllOwnerNotificationsRead = async ({ ownerUserId, kind }) => {
  const where = { ownerUserId, readAt: { [Op.is]: null } };
  const kinds = resolveKindFilter(kind);
  if (kinds?.length === 1) {
    where.kind = kinds[0];
  } else if (kinds?.length > 1) {
    where.kind = { [Op.in]: kinds };
  }

  const [updatedCount] = await OwnerNotification.update({ readAt: new Date() }, { where });
  const unreadCount = await countUnreadNotifications(ownerUserId);
  return { updatedCount, unreadCount };
};

export const deleteOwnerNotification = async ({ ownerUserId, id }) => {
  const deleted = await OwnerNotification.destroy({ where: { id, ownerUserId } });
  if (!deleted) throw new ApiError(404, "Notification not found");
  return { ok: true };
};
