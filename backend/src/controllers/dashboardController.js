import { Op } from "sequelize";
import { ClientLead, Conversation, OwnerNotification, Vehicle } from "../models/index.js";
import { calcDayOverDayChangePct, utcDayBounds } from "../utils/dashboardKpis.js";
import { buildTopProductsRanking } from "../utils/dashboardTopProducts.js";
import { DASHBOARD_ESCALATION_KINDS } from "../services/ownerNotifications.js";
import { isSellerAuth, leadVisibilityWhere } from "../utils/tenantAccess.js";

const isAuth = (value) => Boolean(value) && typeof value === "object";

/** Admin: leads del tenant. Vendedor: solo los asignados a él. Un id suelto se trata como tenant. */
const leadScope = (authOrUserId) => {
  if (!isAuth(authOrUserId)) return { ownerUserId: authOrUserId };
  return leadVisibilityWhere(authOrUserId);
};

/** Catálogo y chats pertenecen al admin del tenant, nunca al id del vendedor. */
const tenantOwnerId = (authOrUserId) => {
  if (!isAuth(authOrUserId)) return authOrUserId;
  return leadVisibilityWhere(authOrUserId).ownerUserId;
};

const visibleLeadsWhere = (authOrUserId) => ({
  ...leadScope(authOrUserId),
  status: { [Op.ne]: "eliminated" },
});

/**
 * Chats del vendedor: JOIN obligatorio al lead asignado.
 * Sin este filtro, `ownerUserId` del vendedor no coincide con ningún chat (viven bajo el admin).
 */
const assignedConversationInclude = (auth) => {
  if (!isSellerAuth(auth)) return undefined;
  const { assignedSellerUserId } = leadVisibilityWhere(auth);
  return [{ model: ClientLead, as: "client", where: { assignedSellerUserId }, required: true }];
};

const conversationQuery = (auth, extraWhere = {}) => {
  const query = { where: { ownerUserId: tenantOwnerId(auth), ...extraWhere } };
  const include = assignedConversationInclude(auth);
  if (include) query.include = include;
  return query;
};

const createdAtBetween = (start, end) => ({
  createdAt: { [Op.between]: [start, end] },
});

const escalationsBetween = (userId, start, end) => ({
  ownerUserId: userId,
  kind: { [Op.in]: DASHBOARD_ESCALATION_KINDS },
  ...createdAtBetween(start, end),
});

/** Leads con interés textual o vehicleId para armar el ranking. */
export const findInterestLeads = (authOrUserId) =>
  ClientLead.findAll({
    where: {
      ...visibleLeadsWhere(authOrUserId),
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

export const findOwnerVehicles = (authOrUserId) =>
  Vehicle.findAll({
    where: { ownerUserId: tenantOwnerId(authOrUserId) },
    attributes: ["id", "brand", "model", "year"],
    raw: true,
  });

export const getDashboard = async (req, res) => {
  const auth = req.auth;
  // El inbox de escalaciones se guarda por destinatario: el vendedor usa su propio id.
  const escalationOwnerUserId = auth.userId;
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
    Conversation.count(conversationQuery(auth)),
    ClientLead.count({
      where: { ...visibleLeadsWhere(auth), ...createdAtBetween(todayBounds.start, todayBounds.end) },
    }),
    ClientLead.count({
      where: { ...visibleLeadsWhere(auth), ...createdAtBetween(yesterdayBounds.start, yesterdayBounds.end) },
    }),
    OwnerNotification.count({
      where: escalationsBetween(escalationOwnerUserId, todayBounds.start, todayBounds.end),
    }),
    OwnerNotification.count({
      where: escalationsBetween(escalationOwnerUserId, yesterdayBounds.start, yesterdayBounds.end),
    }),
    Conversation.count(conversationQuery(auth, { unread: { [Op.gt]: 0 } })),
    findInterestLeads(auth),
    findOwnerVehicles(auth),
    Conversation.findAll({
      ...conversationQuery(auth, {
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
  const auth = req.auth;
  const [interestLeads, vehicles] = await Promise.all([
    findInterestLeads(auth),
    findOwnerVehicles(auth),
  ]);
  return res.json({
    items: buildTopProductsRanking({
      leads: interestLeads,
      vehicles,
      includeZero: true,
    }),
  });
};
