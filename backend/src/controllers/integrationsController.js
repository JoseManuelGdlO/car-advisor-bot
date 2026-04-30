import { z } from "zod";
import { ChannelCredential, ChannelIntegration } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { encryptCredentialsPayload, decryptCredentialsPayload } from "../utils/credentialsCrypto.js";

const channelEnum = z.enum(["whatsapp", "facebook", "telegram", "web", "api"]);

const createSchema = z
  .object({
    channel: channelEnum,
    provider: z.string().min(1).max(60).default("meta"),
    displayName: z.string().max(160).optional().nullable(),
    status: z.enum(["draft", "active", "error", "disabled"]).optional(),
    webhookUrl: z.string().max(500).optional().nullable(),
  })
  .strict();

const patchSchema = z
  .object({
    displayName: z.string().max(160).nullable().optional(),
    status: z.enum(["draft", "active", "error", "disabled"]).optional(),
    webhookUrl: z.string().max(500).nullable().optional(),
  })
  .partial()
  .strict();

const credentialsSchema = z
  .object({
    payload: z.record(z.string(), z.any()).default({}),
  })
  .strict();

// Scope multi-tenant por propietario autenticado.
const ownerWhere = (userId) => ({ ownerUserId: userId });

// DTO estable para frontend, incluyendo si existe credencial activa.
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
    // Lista integraciones por canal/proveedor del usuario actual.
    const rows = await ChannelIntegration.findAll({
      where: ownerWhere(req.auth.userId),
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
    // Crea una integración única por (owner, channel, provider).
    const body = createSchema.parse(req.body);
    const [row, created] = await ChannelIntegration.findOrCreate({
      where: {
        ownerUserId: req.auth.userId,
        channel: body.channel,
        provider: body.provider,
      },
      defaults: {
        ownerUserId: req.auth.userId,
        channel: body.channel,
        provider: body.provider,
        displayName: body.displayName ?? null,
        status: body.status ?? "draft",
        webhookUrl: body.webhookUrl ?? null,
      },
    });
    if (!created) throw new ApiError(409, "Integration already exists for this channel and provider");
    return res.status(201).json(await integrationDto(row));
  } catch (err) {
    return next(err);
  }
};

export const patchIntegration = async (req, res, next) => {
  try {
    // Ajusta metadata operativa sin tocar credenciales.
    const row = await ChannelIntegration.findOne({
      where: { id: req.params.id, ...ownerWhere(req.auth.userId) },
    });
    if (!row) throw new ApiError(404, "Integration not found");
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

export const postIntegrationCredentials = async (req, res, next) => {
  try {
    // Rota credenciales: desactiva previas y guarda nueva versión cifrada.
    const row = await ChannelIntegration.findOne({
      where: { id: req.params.id, ...ownerWhere(req.auth.userId) },
    });
    if (!row) throw new ApiError(404, "Integration not found");
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
    // Healthcheck de credenciales: prueba decrypt local y actualiza estado.
    const row = await ChannelIntegration.findOne({
      where: { id: req.params.id, ...ownerWhere(req.auth.userId) },
    });
    if (!row) throw new ApiError(404, "Integration not found");
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
