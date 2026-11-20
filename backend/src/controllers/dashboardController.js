import { Op } from "sequelize";
import { ClientLead, Conversation, OwnerNotification, Vehicle } from "../models/index.js";
import { calcDayOverDayChangePct, utcDayBounds } from "../utils/dashboardKpis.js";
import { buildTopProductsRanking } from "../utils/dashboardTopProducts.js";
import { DASHBOARD_ESCALATION_KINDS } from "../services/ownerNotifications.js";
import { isSellerAuth, leadVisibilityWhere, resolveTenantOwnerId } from "../utils/tenantAccess.js";

// Scope multi-tenant por propietario (admin del tenant).
const ownerWhere = (userId) => ({ ownerUserId: userId });

/**
 * Normaliza el alcance de leads. Acepta:
 * - string: id del tenant (compatibilidad con llamadas previas, equivale a admin).
 * - auth: `req.auth` (admin ve todo el tenant, vendedor solo sus leads asignados).
 */
const resolveLeadScope = (scopeOrOwnerId) =>
  typeof scopeOrOwnerId === "string" ? ownerWhere(scopeOrOwnerId) : leadVisibilityWhere(scopeOrOwnerId);

const visibleLeadsWhere = (scopeOrOwnerId) => ({
  ...resolveLeadScope(scopeOrOwnerId),
  status: { [Op.ne]: "eliminated" },
});

const createdAtBetween = (start, end) => ({
  createdAt: { [Op.between]: [start, end] },
});

/**
 * Escalaciones recibidas por el usuario autenticado. Las notificaciones se guardan por
 * destinatario, así que cada rol ve solo las suyas (el admin recibe todas las del tenant;
 * el vendedor, solo las de sus leads asignados).
 */
const escalationsBetween = (auth, start, end) => ({
  ownerUserId: auth.userId,
  kind: { [Op.in]: DASHBOARD_ESCALATION_KINDS },
  ...createdAtBetween(start, end),
});

/**
 * Conversaciones del tenant. Para un vendedor se restringe (JOIN requerido) a las de leads
 * asignados a él, igual que la bandeja de conversaciones.
 */
export const conversationScope = (auth, extraWhere = {}) => {
  const tenantId = resolveTenantOwnerId({ auth });
  const query = { where: { ...ownerWhere(tenantId), ...extraWhere } };
  if (isSellerAuth(auth)) {
    const { assignedSellerUserId } = leadVisibilityWhere(auth);
    query.include = [
      { model: ClientLead, as: "client", attributes: [], where: { assignedSellerUserId }, required: true },
    ];
  }
  return query;
};

/** Leads con interés textual o vehicleId para armar el ranking. */
export const findInterestLeads = (scopeOrOwnerId) =>
  ClientLead.findAll({
    where: {
      ...visibleLeadsWhere(scopeOrOwnerId),
      [Op.or]: [
        {
          [Op.and]: [
            { interestedIn: { [Op.not]: null } },
            { interestedIn: { [Op.ne]: "" } },
          ],
        },
        { interestedVehicleId: { [Op.not]: null } },
      ],
    },
    attributes: ["interestedIn", "interestedVehicleId"],
    raw: true,
  });

// El catálogo es del tenant (admin), también para los vendedores.
export const findOwnerVehicles = (tenantId) =>
  Vehicle.findAll({
    where: ownerWhere(tenantId),
    attributes: ["id", "brand", "model", "year"],
    raw: true,
  });

export const getDashboard = async (req, res) => {
  const auth = req.auth;
  const tenantId = resolveTenantOwnerId(req);
  const now = new Date();
  const todayBounds = utcDayBounds(now, 0);
  const yesterdayBounds = utcDayBounds(now, -1);
  const todayUtcEnd = todayBounds.end;

  const weekStartUtc = new Date(todayUtcEnd);
  weekStartUtc.setUTCDate(todayUtcEnd.getUTCDate() - 6);
  weekStartUtc.setUTCHours(0, 0, 0, 0);

  const [
    activeChats,
    newLeadsToday,
    newLeadsYesterday,
    escalationsToday,
    escalationsYesterday,
    waiting,
    interestLeads,
    vehicles,
    weeklyRows,
  ] = await Promise.all([
    Conversation.count(conversationScope(auth)),
    ClientLead.count({
      where: { ...visibleLeadsWhere(auth), ...createdAtBetween(todayBounds.start, todayBounds.end) },
    }),
    ClientLead.count({
      where: { ...visibleLeadsWhere(auth), ...createdAtBetween(yesterdayBounds.start, yesterdayBounds.end) },
    }),
    OwnerNotification.count({
      where: escalationsBetween(auth, todayBounds.start, todayBounds.end),
    }),
    OwnerNotification.count({
      where: escalationsBetween(auth, yesterdayBounds.start, yesterdayBounds.end),
    }),
    Conversation.count(conversationScope(auth, { unread: { [Op.gt]: 0 } })),
    findInterestLeads(auth),
    findOwnerVehicles(tenantId),
    Conversation.findAll({
      ...conversationScope(auth, {
        createdAt: {
          [Op.between]: [weekStartUtc, todayUtcEnd],
        },
      }),
      attributes: ["createdAt"],
      raw: true,
    }),
  ]);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStartUtc);
    d.setUTCDate(weekStartUtc.getUTCDate() + i);
    return d;
  });
  const weekDayMap = new Map(weekDays.map((day) => [day.toISOString().slice(0, 10), 0]));

  weeklyRows.forEach((row) => {
    const rawCreatedAt = row.createdAt || row.created_at;
    const createdAt = rawCreatedAt ? new Date(rawCreatedAt) : null;
    if (!createdAt) return;
    const key = createdAt.toISOString().slice(0, 10);
    if (!weekDayMap.has(key)) return;
    weekDayMap.set(key, (weekDayMap.get(key) || 0) + 1);
  });

  const weeklyChats = weekDays.map((day) => weekDayMap.get(day.toISOString().slice(0, 10)) || 0);
  return res.json({
    activeChats,
    newToday: 0,
    waiting,
    newLeads: newLeadsToday,
    newLeadsChange: calcDayOverDayChangePct(newLeadsToday, newLeadsYesterday),
    escalations: escalationsToday,
    escalationsChange: calcDayOverDayChangePct(escalationsToday, escalationsYesterday),
    weeklyChats,
    topProducts: buildTopProductsRanking({
      leads: interestLeads,
      vehicles,
      limit: 5,
      includeZero: false,
    }),
  });
};

/** Ranking completo de autos consultados más el catálogo sin consultas (con 0). */
export const getTopProducts = async (req, res) => {
  const [interestLeads, vehicles] = await Promise.all([
    findInterestLeads(req.auth),
    findOwnerVehicles(resolveTenantOwnerId(req)),
  ]);
  return res.json({
    items: buildTopProductsRanking({
      leads: interestLeads,
      vehicles,
      includeZero: true,
    }),
  });
};
