import { Op, fn, col } from "sequelize";
import { ClientLead, Conversation } from "../models/index.js";

const ownerWhere = (userId) => ({ ownerUserId: userId });

export const getDashboard = async (req, res) => {
  const userId = req.auth.userId;
  const [activeChats, newLeads, conversions, waiting, topRows] = await Promise.all([
    Conversation.count({ where: ownerWhere(userId) }),
    ClientLead.count({ where: { ...ownerWhere(userId), status: "lead" } }),
    ClientLead.count({ where: { ...ownerWhere(userId), status: "sold" } }),
    Conversation.count({ where: { ...ownerWhere(userId), unread: { [Op.gt]: 0 } } }),
    ClientLead.findAll({
      where: ownerWhere(userId),
      attributes: ["interestedIn", [fn("COUNT", col("interested_in")), "queries"]],
      group: ["interested_in"],
      order: [[fn("COUNT", col("interested_in")), "DESC"]],
      limit: 5,
      raw: true,
    }),
  ]);
  return res.json({
    activeChats,
    newToday: 0,
    waiting,
    newLeads,
    newLeadsChange: 0,
    conversions,
    conversionsChange: 0,
    weeklyChats: [0, 0, 0, 0, 0, 0, activeChats],
    topProducts: topRows.map((x) => ({
      name: x.interested_in || x.interestedIn || "Sin dato",
      queries: Number(x.queries || 0),
    })),
  });
};
