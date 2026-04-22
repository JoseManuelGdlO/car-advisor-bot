import { ClientLead } from "../models/index.js";
import { ApiError } from "../utils/errors.js";

const ownerWhere = (userId) => ({ ownerUserId: userId });

export const listClients = async (req, res) => {
  const rows = await ClientLead.findAll({ where: ownerWhere(req.auth.userId), order: [["updatedAt", "DESC"]] });
  return res.json(rows);
};

export const getClient = async (req, res, next) => {
  const row = await ClientLead.findOne({ where: { id: req.params.id, ...ownerWhere(req.auth.userId) } });
  if (!row) return next(new ApiError(404, "Client not found"));
  return res.json(row);
};

export const createClient = async (req, res) => {
  const row = await ClientLead.create({ ...req.body, ownerUserId: req.auth.userId });
  return res.status(201).json(row);
};
