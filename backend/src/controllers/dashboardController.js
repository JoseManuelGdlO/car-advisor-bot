import { Op, fn, col, where } from "sequelize";
import { ClientLead, Conversation } from "../models/index.js";

// Scope multi-tenant por propietario autenticado.
const ownerWhere = (userId) => ({ ownerUserId: userId });

export const getDashboard = async (req, res) => {
  // Agrega KPIs principales para cards y gráficas del dashboard.
  const userId = req.auth.userId;
  const now = new Date();
  const todayUtcEnd = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
  const weekStartUtc = new Date(todayUtcEnd);
  weekStartUtc.setUTCDate(todayUtcEnd.getUTCDate() - 6);
  weekStartUtc.setUTCHours(0, 0, 0, 0);

  const [activeChats, newLeads, conversions, waiting, topRows, weeklyRows] = await Promise.all([
    Conversation.count({ where: ownerWhere(userId) }),
    ClientLead.count({ where: { ...ownerWhere(userId), status: "lead" } }),
    ClientLead.count({ where: { ...ownerWhere(userId), status: "sold" } }),
    Conversation.count({ where: { ...ownerWhere(userId), unread: { [Op.gt]: 0 } } }),
    ClientLead.findAll({
      where: {
        ...ownerWhere(userId),
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
  const weekDayMap = new Map(
    weekDays.map((day) => [day.toISOString().slice(0, 10), 0])
  );

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
    newLeads,
    newLeadsChange: 0,
    conversions,
    conversionsChange: 0,
    weeklyChats,
    topProducts: topRows
      .map((x) => ({
        name: String(x.interested_in || x.interestedIn || "").trim(),
        queries: Number(x.queries || 0),
      }))
      .filter((x) => x.name),
  });
};
