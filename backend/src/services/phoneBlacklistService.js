import { Op } from "sequelize";
import { BlackListEntry } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import {
  blacklistPhoneLookupValues,
  isWhatsappChannelId,
  MEXICO_WHATSAPP_MAX_DIGITS,
  normalizeBlacklistPhone,
} from "../utils/whatsappIdentity.js";

const normalizeRequiredPhone = (phone) => {
  const compact = String(phone || "").trim().replace(/\s/g, "");
  if (!compact || isWhatsappChannelId(compact)) {
    throw new ApiError(400, "Introduce un teléfono válido.");
  }

  const digits = compact.replace(/\D/g, "");
  if (digits.length > MEXICO_WHATSAPP_MAX_DIGITS) {
    throw new ApiError(400, "El teléfono no puede tener más de 13 dígitos.");
  }

  const normalizedPhone = normalizeBlacklistPhone(phone);
  if (!normalizedPhone) {
    throw new ApiError(400, "Introduce un teléfono válido.");
  }
  return normalizedPhone;
};

export const isPhoneBlacklisted = async ({ ownerUserId, displayPhone }) => {
  const normalizedPhone = normalizeBlacklistPhone(displayPhone);
  if (!normalizedPhone) return false;

  const row = await BlackListEntry.findOne({
    where: {
      ownerUserId,
      phone: { [Op.in]: blacklistPhoneLookupValues(normalizedPhone) },
    },
  });
  return Boolean(row);
};

export const listBlacklistedPhones = async (ownerUserId) =>
  BlackListEntry.findAll({
    where: { ownerUserId },
    order: [["createdAt", "DESC"]],
  });

export const addBlacklistedPhone = async (ownerUserId, phone) => {
  const normalizedPhone = normalizeRequiredPhone(phone);

  if (await isPhoneBlacklisted({ ownerUserId, displayPhone: normalizedPhone })) {
    throw new ApiError(409, "Ese teléfono ya está en la blacklist.");
  }

  try {
    return await BlackListEntry.create({
      ownerUserId,
      phone: normalizedPhone,
    });
  } catch (error) {
    if (error?.name === "SequelizeUniqueConstraintError") {
      throw new ApiError(409, "Ese teléfono ya está en la blacklist.");
    }
    throw error;
  }
};

export const removeBlacklistedPhone = async (ownerUserId, id) => {
  const row = await BlackListEntry.findOne({
    where: { id, ownerUserId },
  });
  if (!row) {
    throw new ApiError(404, "Teléfono no encontrado en la blacklist.");
  }
  await row.destroy();
  return true;
};
