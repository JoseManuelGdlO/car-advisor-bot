import { z } from "zod";
import { User, ServiceToken } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { comparePassword, hashPassword, randomToken, sha256, signUserJwt } from "../utils/auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

export const register = async (req, res, next) => {
  try {
    const { email, password, name } = z.object({
      email: z.string().email(),
      password: z.string().min(6),
      name: z.string().min(2),
    }).parse(req.body);
    const exists = await User.findOne({ where: { email } });
    if (exists) throw new ApiError(409, "Email already exists");
    const user = await User.create({ email, name, passwordHash: await hashPassword(password) });
    return res.status(201).json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    return next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await User.findOne({ where: { email } });
    if (!user) throw new ApiError(401, "Invalid credentials");
    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) throw new ApiError(401, "Invalid credentials");
    const token = signUserJwt({ sub: user.id, email: user.email, type: "user" });
    return res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    return next(err);
  }
};

export const createServiceToken = async (req, res, next) => {
  try {
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
