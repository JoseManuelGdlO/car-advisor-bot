import crypto from "crypto";
import { Op } from "sequelize";
import { PasswordResetCode, User } from "../models/index.js";
import { env } from "../config/env.js";
import { hashPassword, sha256 } from "../utils/auth.js";
import { ApiError } from "../utils/errors.js";
import { sendPasswordResetCode } from "./emailService.js";

export const RESET_SUCCESS_MESSAGE = "Te enviamos un código de verificación a tu correo.";
export const RESET_USER_NOT_FOUND_MESSAGE = "Usuario no válido.";
export const RESET_INVALID_MESSAGE = "Código inválido o expirado.";

export const generateResetCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

export const buildResetExpiresAt = (now, ttlMinutes) => new Date(now.getTime() + ttlMinutes * 60_000);

export const isResetCodeExpired = (expiresAt, now = new Date()) => expiresAt.getTime() <= now.getTime();

export const isResetAttemptsExceeded = (attemptCount, maxAttempts) => attemptCount >= maxAttempts;

export const resolveResetCodeMatch = (providedCode, storedHash) => sha256(providedCode) === storedHash;

export const findActiveResetCode = async (userId, now = new Date()) =>
  PasswordResetCode.findOne({
    where: {
      userId,
      usedAt: null,
      expiresAt: { [Op.gt]: now },
    },
    order: [["createdAt", "DESC"]],
  });

export const requestPasswordReset = async (email) => {
  const normalizedEmail = email.trim();
  const user = await User.findOne({ where: { email: normalizedEmail, active: true } });
  if (!user) throw new ApiError(404, RESET_USER_NOT_FOUND_MESSAGE);

  const now = new Date();
  const code = generateResetCode();
  const expiresAt = buildResetExpiresAt(now, env.passwordReset.codeTtlMinutes);

  await PasswordResetCode.update(
    { usedAt: now },
    { where: { userId: user.id, usedAt: null } },
  );

  await PasswordResetCode.create({
    userId: user.id,
    codeHash: sha256(code),
    expiresAt,
    attemptCount: 0,
  });

  await sendPasswordResetCode({ to: user.email, code });
  return { ok: true, message: RESET_SUCCESS_MESSAGE };
};

export const resetPasswordWithCode = async ({ email, code, password }) => {
  const normalizedEmail = email.trim();
  const user = await User.findOne({ where: { email: normalizedEmail, active: true } });
  if (!user) throw new ApiError(400, RESET_INVALID_MESSAGE);

  const now = new Date();
  const row = await findActiveResetCode(user.id, now);
  if (!row) throw new ApiError(400, RESET_INVALID_MESSAGE);

  if (isResetAttemptsExceeded(row.attemptCount, env.passwordReset.maxAttempts)) {
    throw new ApiError(400, RESET_INVALID_MESSAGE);
  }

  if (!resolveResetCodeMatch(code, row.codeHash)) {
    await row.update({ attemptCount: row.attemptCount + 1 });
    throw new ApiError(400, RESET_INVALID_MESSAGE);
  }

  if (isResetCodeExpired(row.expiresAt, now)) {
    throw new ApiError(400, RESET_INVALID_MESSAGE);
  }

  await user.update({ passwordHash: await hashPassword(password) });
  await row.update({ usedAt: now });
  return { ok: true };
};
