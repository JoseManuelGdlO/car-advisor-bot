import { z } from "zod";
import { User, ServiceToken } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { comparePassword, hashPassword, randomToken, sha256, signUserJwt } from "../utils/auth.js";
import { calendarSchedulingUrlSchema, DEFAULT_CALENDAR_SCHEDULING_URL } from "../utils/calendarUrl.js";
import { requestPasswordReset, resetPasswordWithCode } from "../services/passwordResetService.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

export const register = async (req, res, next) => {
  try {
    // Registro de usuario final con validación mínima de perfil/credenciales.
    const { email, password, name, calendarSchedulingUrl } = z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
        name: z.string().min(2),
        calendarSchedulingUrl: z.preprocess(
          (value) => {
            if (typeof value !== "string") return value;
            const trimmed = value.trim();
            return trimmed ? trimmed : undefined;
          },
          calendarSchedulingUrlSchema.optional(),
        ),
      })
      .parse(req.body);
    const exists = await User.findOne({ where: { email } });
    if (exists) throw new ApiError(409, "Ya existe una cuenta con este correo.");
    const user = await User.create({
      email,
      name,
      passwordHash: await hashPassword(password),
      calendarSchedulingUrl: calendarSchedulingUrl || DEFAULT_CALENDAR_SCHEDULING_URL,
    });
    return res.status(201).json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    return next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    // Login clásico: valida credenciales y emite JWT de usuario.
    const { email, password } = loginSchema.parse(req.body);
    const user = await User.findOne({ where: { email } });
    if (!user) throw new ApiError(401, "Credenciales incorrectas.");
    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) throw new ApiError(401, "Credenciales incorrectas.");
    const token = signUserJwt({ sub: user.id, email: user.email, type: "user" });
    return res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    return next(err);
  }
};

export const createServiceToken = async (req, res, next) => {
  try {
    // Crea token máquina-a-máquina para integraciones internas (bot/backend jobs).
    const { name } = z.object({ name: z.string().min(2).max(120) }).parse(req.body);
    const raw = randomToken();
    const item = await ServiceToken.create({
      ownerUserId: req.auth.userId,
      name,
      tokenHash: sha256(raw),
      scopes: ["bot:write"],
    });
    return res.status(201).json({ id: item.id, token: raw, name: item.name });
  } catch (err) {
    return next(err);
  }
};

export const revokeServiceToken = async (req, res, next) => {
  try {
    // Revocación lógica: marca `revokedAt` sin borrar histórico.
    const item = await ServiceToken.findOne({ where: { id: req.params.id, ownerUserId: req.auth.userId } });
    if (!item) throw new ApiError(404, "Token not found");
    await item.update({ revokedAt: new Date() });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
};

export const listServiceTokens = async (req, res, next) => {
  try {
    // Lista metadatos de tokens del usuario autenticado (sin exponer token plano).
    const rows = await ServiceToken.findAll({
      where: { ownerUserId: req.auth.userId },
      attributes: ["id", "name", "scopes", "revokedAt", "lastUsedAt", "createdAt"],
      order: [["createdAt", "DESC"]],
    });
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const result = await requestPasswordReset(email);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const body = z
      .object({
        email: z.string().email(),
        code: z.string().length(6).regex(/^\d{6}$/),
        password: z.string().min(6),
      })
      .parse(req.body);
    const result = await resetPasswordWithCode(body);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
};
