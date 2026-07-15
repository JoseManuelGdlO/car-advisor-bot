import { Op, fn, col, where } from "sequelize";
import { ClientLead, Conversation, OwnerNotification } from "../models/index.js";
import { calcDayOverDayChangePct, utcDayBounds } from "../utils/dashboardKpis.js";
import { DASHBOARD_ESCALATION_KINDS } from "../services/ownerNotifications.js";

// Scope multi-tenant por propietario autenticado.
const ownerWhere = (userId) => ({ ownerUserId: userId });

const visibleLeadsWhere = (userId) => ({
  ...ownerWhere(userId),
  status: { [Op.ne]: "eliminated" },
});

const createdAtBetween = (start, end) => ({
  createdAt: { [Op.between]: [start, end] },
});

const escalationsBetween = (userId, start, end) => ({
  ownerUserId: userId,
  kind: { [Op.in]: DASHBOARD_ESCALATION_KINDS },
  ...createdAtBetween(start, end),
});

export const getDashboard = async (req, res) => {
  const userId = req.auth.userId;
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
    topRows,
    weeklyRows,
  ] = await Promise.all([
    Conversation.count({ where: ownerWhere(userId) }),
    ClientLead.count({
      where: { ...visibleLeadsWhere(userId), ...createdAtBetween(todayBounds.start, todayBounds.end) },
    }),
    ClientLead.count({
      where: { ...visibleLeadsWhere(userId), ...createdAtBetween(yesterdayBounds.start, yesterdayBounds.end) },
    }),
    OwnerNotification.count({
      where: escalationsBetween(userId, todayBounds.start, todayBounds.end),
    }),
    OwnerNotification.count({
      where: escalationsBetween(userId, yesterdayBounds.start, yesterdayBounds.end),
    }),
    Conversation.count({ where: { ...ownerWhere(userId), unread: { [Op.gt]: 0 } } }),
    ClientLead.findAll({
      where: {
        ...visibleLeadsWhere(userId),
        [Op.and]: [
          { interestedIn: { [Op.not]: null } },
          { interestedIn: { [Op.ne]: "" } },
          where(fn("TRIM", col("interested_in")), { [Op.ne]: "" }),
        ],
      },
      attributes: ["interestedIn", [fn("COUNT", col("interested_in")), "queries"]],
      group: ["interested_in"],
      order: [[fn("COUNT", col("interested_in")), "DESC"]],
      limit: 5,
      raw: true,
    }),
    Conversation.findAll({
      where: {
        ...ownerWhere(userId),
        createdAt: {
          [Op.between]: [weekStartUtc, todayUtcEnd],
        },
      },
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
    topProducts: topRows
      .map((x) => ({
        name: String(x.interested_in || x.interestedIn || "").trim(),
        queries: Number(x.queries || 0),
      }))
      .filter((x) => x.name),
  });
};
