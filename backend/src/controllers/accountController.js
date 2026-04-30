import { z } from "zod";
import { BusinessProfile, User } from "../models/index.js";
import { ApiError } from "../utils/errors.js";

const businessPatchSchema = z
  .object({
    tradeName: z.string().max(200).optional().nullable(),
    legalName: z.string().max(200).optional().nullable(),
    taxId: z.string().max(64).optional().nullable(),
    businessPhone: z.string().max(40).optional().nullable(),
    businessEmail: z.union([z.string().email().max(190), z.literal("")]).optional().nullable(),
    website: z.string().max(500).optional().nullable(),
    addressLine: z.string().max(255).optional().nullable(),
    city: z.string().max(120).optional().nullable(),
    state: z.string().max(120).optional().nullable(),
    country: z.string().max(120).optional().nullable(),
    description: z.string().max(8000).optional().nullable(),
    logoUrl: z.string().max(500).optional().nullable(),
  })
  .strict();

const userPatchSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    phone: z.string().max(32).optional().nullable(),
    defaultPlatform: z.enum(["whatsapp", "facebook", "telegram", "web", "api"]).optional().nullable(),
  })
  .strict();

// Presentación del perfil comercial para frontend (evita exponer columnas internas).
const toBusinessDto = (row) => {
  if (!row) return null;
  return {
    tradeName: row.tradeName,
    legalName: row.legalName,
    taxId: row.taxId,
    businessPhone: row.businessPhone,
    businessEmail: row.businessEmail,
    website: row.website,
    addressLine: row.addressLine,
    city: row.city,
    state: row.state,
    country: row.country,
    description: row.description,
    logoUrl: row.logoUrl,
  };
};

export const getAccountProfile = async (req, res, next) => {
  try {
    // Obtiene perfil de usuario + business profile (creándolo si no existe).
    const user = await User.findByPk(req.auth.userId);
    if (!user) throw new ApiError(404, "User not found");
    const [business] = await BusinessProfile.findOrCreate({
      where: { ownerUserId: user.id },
      defaults: { ownerUserId: user.id },
    });
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        defaultPlatform: user.defaultPlatform,
      },
      business: toBusinessDto(business),
    });
  } catch (err) {
    return next(err);
  }
};

export const patchAccountProfile = async (req, res, next) => {
  try {
    // Aplica patch parcial validado sobre usuario y datos de negocio.
    const user = await User.findByPk(req.auth.userId);
    if (!user) throw new ApiError(404, "User not found");
    const userPatch = userPatchSchema.safeParse(req.body?.user || {});
    if (!userPatch.success) throw new ApiError(400, userPatch.error.message);
    const businessPatch = businessPatchSchema.safeParse(req.body?.business || {});
    if (!businessPatch.success) throw new ApiError(400, businessPatch.error.message);

    const u = userPatch.data;
    if (Object.keys(u).length) {
      await user.update({
        ...(u.name !== undefined ? { name: u.name } : {}),
        ...(u.phone !== undefined ? { phone: u.phone || null } : {}),
        ...(u.defaultPlatform !== undefined ? { defaultPlatform: u.defaultPlatform || null } : {}),
      });
    }

    const [business] = await BusinessProfile.findOrCreate({
      where: { ownerUserId: user.id },
      defaults: { ownerUserId: user.id },
    });
    const b = businessPatch.data;
    if (Object.keys(b).length) {
      await business.update({
        ...(b.tradeName !== undefined ? { tradeName: b.tradeName || null } : {}),
        ...(b.legalName !== undefined ? { legalName: b.legalName || null } : {}),
        ...(b.taxId !== undefined ? { taxId: b.taxId || null } : {}),
        ...(b.businessPhone !== undefined ? { businessPhone: b.businessPhone || null } : {}),
        ...(b.businessEmail !== undefined ? { businessEmail: b.businessEmail || null } : {}),
        ...(b.website !== undefined ? { website: b.website || null } : {}),
        ...(b.addressLine !== undefined ? { addressLine: b.addressLine || null } : {}),
        ...(b.city !== undefined ? { city: b.city || null } : {}),
        ...(b.state !== undefined ? { state: b.state || null } : {}),
        ...(b.country !== undefined ? { country: b.country || null } : {}),
        ...(b.description !== undefined ? { description: b.description || null } : {}),
        ...(b.logoUrl !== undefined ? { logoUrl: b.logoUrl || null } : {}),
      });
    }

    await user.reload();
    await business.reload();
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        defaultPlatform: user.defaultPlatform,
      },
      business: toBusinessDto(business),
    });
  } catch (err) {
    return next(err);
  }
};

const deleteAccountSchema = z
  .object({
    confirmText: z.string().trim().min(1),
  })
  .strict();

export const deleteAccount = async (req, res, next) => {
  try {
    // Eliminación de cuenta con confirmación explícita para prevenir borrados accidentales.
    const { confirmText } = deleteAccountSchema.parse(req.body || {});
    if (confirmText.toUpperCase() !== "ELIMINAR") {
      throw new ApiError(400, "Debes escribir ELIMINAR para confirmar.");
    }

    const user = await User.findByPk(req.auth.userId);
    if (!user) throw new ApiError(404, "User not found");

    await user.destroy();
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
};
