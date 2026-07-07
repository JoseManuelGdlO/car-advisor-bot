import { Op } from "sequelize";
import { z } from "zod";
import { ClientLead } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { isWhatsappChannelId, normalizeDisplayPhone } from "../utils/whatsappIdentity.js";

const ELIMINATED_STATUS = "eliminated";
const commercialStatusEnum = z.enum(["lead", "negotiation", "sold", "lost"]);
const channelEnum = z.enum(["whatsapp", "facebook", "telegram", "web", "api", "instagram"]);

export const patchClientSchema = z
  .object({
    name: z.string().min(1).max(120),
    displayPhone: z.string().max(40).optional().nullable(),
    status: commercialStatusEnum,
    interestedIn: z.string().max(160).optional().nullable(),
  })
  .strict();

export const createClientSchema = z
  .object({
    name: z.string().min(1).max(120),
    phone: z.string().min(1).max(40),
    channel: channelEnum.optional(),
    status: commercialStatusEnum.optional(),
    interestedIn: z.string().max(160).optional().nullable(),
    notes: z.string().optional().nullable(),
    avatarColor: z.string().max(40).optional().nullable(),
  })
  .strict();

const ownerWhere = (userId) => ({ ownerUserId: userId });

export const visibleClientsWhere = (userId) => ({
  ...ownerWhere(userId),
  status: { [Op.ne]: ELIMINATED_STATUS },
});

export const resolveCreateClientOutcome = (existing, body) => {
  if (!existing) return { kind: "create" };
  if (existing.status === ELIMINATED_STATUS) {
    return {
      kind: "reactivate",
      patch: {
        name: body.name,
        phone: body.phone,
        displayPhone: normalizeDisplayPhone(body.phone) ?? body.phone,
        channel: body.channel ?? existing.channel ?? "web",
        status: body.status ?? "lead",
        interestedIn: body.interestedIn !== undefined ? body.interestedIn : existing.interestedIn,
        notes: body.notes !== undefined ? body.notes : existing.notes,
        avatarColor: body.avatarColor !== undefined ? body.avatarColor : existing.avatarColor,
      },
    };
  }
  return { kind: "conflict" };
};

const findOwnedVisibleClientOr404 = async (userId, id) => {
  const row = await ClientLead.findOne({
    where: { id, ...visibleClientsWhere(userId) },
  });
  if (!row) throw new ApiError(404, "Client not found");
  return row;
};

export const listClients = async (req, res) => {
  const rows = await ClientLead.findAll({
    where: visibleClientsWhere(req.auth.userId),
    order: [["updatedAt", "DESC"]],
  });
  return res.json(rows);
};

export const getClient = async (req, res, next) => {
  try {
    const row = await findOwnedVisibleClientOr404(req.auth.userId, req.params.id);
    return res.json(row);
  } catch (err) {
    return next(err);
  }
};

export const createClient = async (req, res, next) => {
  try {
    const body = createClientSchema.parse(req.body);
    const existing = await ClientLead.findOne({
      where: { ownerUserId: req.auth.userId, phone: body.phone },
    });
    const outcome = resolveCreateClientOutcome(existing, body);
    if (outcome.kind === "conflict") {
      throw new ApiError(409, "Client already exists for this phone number");
    }
    if (outcome.kind === "reactivate") {
      await existing.update(outcome.patch);
      return res.status(201).json(existing);
    }
    const row = await ClientLead.create({
      ownerUserId: req.auth.userId,
      name: body.name,
      phone: body.phone,
      displayPhone: normalizeDisplayPhone(body.phone) ?? body.phone,
      channel: body.channel ?? "web",
      status: body.status ?? "lead",
      interestedIn: body.interestedIn ?? "",
      notes: body.notes ?? null,
      avatarColor: body.avatarColor ?? undefined,
    });
    return res.status(201).json(row);
  } catch (err) {
    return next(err);
  }
};

export const patchClient = async (req, res, next) => {
  try {
    const row = await findOwnedVisibleClientOr404(req.auth.userId, req.params.id);
    const body = patchClientSchema.parse(req.body || {});
    const updates = {
      name: body.name,
      status: body.status,
      interestedIn: body.interestedIn ?? "",
    };
    if (body.displayPhone !== undefined) {
      const normalized = body.displayPhone ? normalizeDisplayPhone(body.displayPhone) : null;
      updates.displayPhone = normalized;
      if (!isWhatsappChannelId(row.phone) && normalized) {
        updates.phone = normalized;
      }
    }
    await row.update(updates);
    return res.json(row);
  } catch (err) {
    return next(err);
  }
};

export const deleteClient = async (req, res, next) => {
  try {
    const row = await findOwnedVisibleClientOr404(req.auth.userId, req.params.id);
    await row.update({ status: ELIMINATED_STATUS });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
};
