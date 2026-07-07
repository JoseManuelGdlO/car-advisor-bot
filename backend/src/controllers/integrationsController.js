import { Op } from "sequelize";
import { z } from "zod";
import { ChannelCredential, ChannelIntegration } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { encryptCredentialsPayload, decryptCredentialsPayload } from "../utils/credentialsCrypto.js";

const channelEnum = z.enum(["whatsapp", "facebook", "telegram", "web", "api", "instagram"]);
const userVisibleStatusEnum = z.enum(["draft", "active", "error", "disabled"]);
const ELIMINATED_STATUS = "eliminated";

const createSchema = z
  .object({
    channel: channelEnum,
    provider: z.string().min(1).max(60).default("meta"),
    displayName: z.string().max(160).optional().nullable(),
    status: userVisibleStatusEnum.optional(),
    webhookUrl: z.string().max(500).optional().nullable(),
  })
  .strict();

const patchSchema = z
  .object({
    displayName: z.string().max(160).nullable().optional(),
    status: userVisibleStatusEnum.optional(),
    webhookUrl: z.string().max(500).nullable().optional(),
  })
  .partial()
  .strict();

const credentialsSchema = z
  .object({
    payload: z.record(z.string(), z.any()).default({}),
  })
  .strict();

const ownerWhere = (userId) => ({ ownerUserId: userId });

const visibleIntegrationsWhere = (userId) => ({
  ...ownerWhere(userId),
  status: { [Op.ne]: ELIMINATED_STATUS },
});

export const resolveCreateIntegrationOutcome = (existing, body) => {
  if (!existing) return { kind: "create" };
  if (existing.status === ELIMINATED_STATUS) {
    return {
      kind: "reactivate",
      patch: {
        status: body.status ?? "draft",
        displayName: body.displayName !== undefined ? body.displayName : existing.displayName,
        webhookUrl: body.webhookUrl !== undefined ? body.webhookUrl : existing.webhookUrl,
        lastError: null,
      },
    };
  }
  return { kind: "conflict" };
};

const findOwnedIntegrationOr404 = async (userId, id) => {
  const row = await ChannelIntegration.findOne({
    where: { id, ...visibleIntegrationsWhere(userId) },
  });
  if (!row) throw new ApiError(404, "Integration not found");
  return row;
};

const integrationDto = async (row) => {
  const activeCred = await ChannelCredential.findOne({
    where: { ownerUserId: row.ownerUserId, channelIntegrationId: row.id, isActive: true },
  });
  return {
    id: row.id,
    channel: row.channel,
    provider: row.provider,
    displayName: row.displayName,
    status: row.status,
    webhookUrl: row.webhookUrl,
    lastHealthcheckAt: row.lastHealthcheckAt,
    lastError: row.lastError,
    hasActiveCredential: Boolean(activeCred),
  };
};

export const listIntegrations = async (req, res, next) => {
  try {
    const rows = await ChannelIntegration.findAll({
      where: visibleIntegrationsWhere(req.auth.userId),
      order: [["updatedAt", "DESC"]],
    });
    const out = await Promise.all(rows.map((r) => integrationDto(r)));
    return res.json(out);
  } catch (err) {
    return next(err);
  }
};

export const createIntegration = async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const existing = await ChannelIntegration.findOne({
      where: {
        ownerUserId: req.auth.userId,
        channel: body.channel,
        provider: body.provider,
      },
    });
    const outcome = resolveCreateIntegrationOutcome(existing, body);
    if (outcome.kind === "conflict") {
      throw new ApiError(409, "Integration already exists for this channel and provider");
    }
    if (outcome.kind === "reactivate") {
      await existing.update(outcome.patch);
      return res.status(201).json(await integrationDto(existing));
    }
    const row = await ChannelIntegration.create({
      ownerUserId: req.auth.userId,
      channel: body.channel,
      provider: body.provider,
      displayName: body.displayName ?? null,
      status: body.status ?? "draft",
      webhookUrl: body.webhookUrl ?? null,
    });
    return res.status(201).json(await integrationDto(row));
  } catch (err) {
    return next(err);
  }
};

export const patchIntegration = async (req, res, next) => {
  try {
    const row = await findOwnedIntegrationOr404(req.auth.userId, req.params.id);
    const body = patchSchema.parse(req.body || {});
    await row.update({
      ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.webhookUrl !== undefined ? { webhookUrl: body.webhookUrl } : {}),
    });
    return res.json(await integrationDto(row));
  } catch (err) {
    return next(err);
  }
};

export const deleteIntegration = async (req, res, next) => {
  try {
    const row = await findOwnedIntegrationOr404(req.auth.userId, req.params.id);
    await row.update({ status: ELIMINATED_STATUS });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
};

export const postIntegrationCredentials = async (req, res, next) => {
  try {
    const row = await findOwnedIntegrationOr404(req.auth.userId, req.params.id);
    const { payload } = credentialsSchema.parse(req.body || {});
    const cipherText = encryptCredentialsPayload(payload);

    await ChannelCredential.update(
      { isActive: false },
      { where: { ownerUserId: req.auth.userId, channelIntegrationId: row.id } }
    );
    await ChannelCredential.create({
      ownerUserId: req.auth.userId,
      channelIntegrationId: row.id,
      credentialType: "json_secrets",
      cipherText,
      isActive: true,
    });
    await row.update({ status: "active", lastError: null });
    return res.status(201).json({ ok: true, hasActiveCredential: true });
  } catch (err) {
    return next(err);
  }
};

export const postIntegrationTest = async (req, res, next) => {
  try {
    const row = await findOwnedIntegrationOr404(req.auth.userId, req.params.id);
    const cred = await ChannelCredential.findOne({
      where: { ownerUserId: req.auth.userId, channelIntegrationId: row.id, isActive: true },
    });
    if (!cred) throw new ApiError(400, "No active credentials to test");
    try {
      decryptCredentialsPayload(cred.cipherText);
      await row.update({
        lastHealthcheckAt: new Date(),
        lastError: null,
        status: row.status === "error" ? "active" : row.status,
      });
      return res.json({ ok: true, message: "Credentials decrypt OK" });
    } catch (e) {
      await row.update({
        lastHealthcheckAt: new Date(),
        lastError: e?.message || "Decrypt failed",
        status: "error",
      });
      throw new ApiError(400, "Credential test failed");
    }
  } catch (err) {
    return next(err);
  }
};
