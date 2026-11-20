import { z } from "zod";
import { BotSetting, BusinessProfile, User } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { toBusinessProfileDto } from "../utils/businessProfile.js";
import { calendarSchedulingUrlSchema } from "../utils/calendarUrl.js";
import { toAccountNotificationPreferencesDto } from "../services/notificationPreferences.js";
import { comparePassword, hashPassword } from "../utils/auth.js";
import { assertAdmin, isAdminAuth, isSellerAuth, toUserSessionDto } from "../utils/tenantAccess.js";

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
    email: z.string().trim().email().max(190).optional(),
    password: z.string().min(6).max(200).optional(),
    currentPassword: z.string().min(1).max(200).optional(),
    defaultPlatform: z.enum(["whatsapp", "facebook", "telegram", "web", "api", "instagram"]).optional().nullable(),
    calendarSchedulingUrl: calendarSchedulingUrlSchema.optional(),
  })
  .strict();

// Zona horaria del tenant (bot settings del admin): los vendedores la necesitan para mostrar horas.
const loadTenantDto = async (tenantOwnerUserId) => {
  const row = await BotSetting.findOne({ where: { ownerUserId: tenantOwnerUserId }, attributes: ["timezone"] });
  return { timezone: row?.timezone || null };
};

const toProfileUserDto = (user) => ({
  ...toUserSessionDto(user),
  phone: user.phone,
  defaultPlatform: user.defaultPlatform,
  calendarSchedulingUrl: user.calendarSchedulingUrl,
});

export const getAccountProfile = async (req, res, next) => {
  try {
    // Obtiene perfil de usuario + business profile (creándolo si no existe).
    const user = await User.findByPk(req.auth.userId);
    if (!user) throw new ApiError(404, "User not found");
    // Vendedor: solo cuenta personal; el perfil de negocio/calendario es del tenant (admin).
    const tenant = await loadTenantDto(req.auth.tenantOwnerUserId || user.id);
    if (isSellerAuth(req.auth)) {
      return res.json({ user: toProfileUserDto(user), business: null, tenant });
    }
    const [business] = await BusinessProfile.findOrCreate({
      where: { ownerUserId: user.id },
      defaults: { ownerUserId: user.id },
    });
    return res.json({
      user: toProfileUserDto(user),
      business: toBusinessProfileDto(business),
      tenant,
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
    if (!userPatch.success) throw userPatch.error;
    const businessPatch = businessPatchSchema.safeParse(req.body?.business || {});
    if (!businessPatch.success) throw businessPatch.error;

    if (isSellerAuth(req.auth)) {
      const touchesTenantData =
        userPatch.data.calendarSchedulingUrl !== undefined || Object.keys(businessPatch.data).length > 0;
      if (touchesTenantData) {
        throw new ApiError(403, "Solo el administrador puede editar el negocio o el calendario.");
      }
    }

    const u = userPatch.data;
    const nextEmail = u.email?.trim();
    const emailChanged = nextEmail !== undefined && nextEmail !== user.email;
    const passwordChange = u.password !== undefined;
    if (emailChanged || passwordChange) {
      // 400, no 401: un 401 con Bearer cierra la sesión en el cliente.
      if (!u.currentPassword) {
        throw new ApiError(400, "Escribe tu contraseña actual para cambiar el correo o la contraseña.");
      }
      const passwordOk = await comparePassword(u.currentPassword, user.passwordHash || "");
      if (!passwordOk) throw new ApiError(400, "La contraseña actual no es correcta.");
    }
    if (emailChanged) {
      const existing = await User.findOne({ where: { email: nextEmail } });
      if (existing && existing.id !== user.id) {
        throw new ApiError(409, "Ya existe una cuenta con este correo.");
      }
    }
    if (Object.keys(u).length) {
      await user.update({
        ...(u.name !== undefined ? { name: u.name } : {}),
        ...(u.phone !== undefined ? { phone: u.phone || null } : {}),
        ...(emailChanged ? { email: nextEmail } : {}),
        ...(passwordChange ? { passwordHash: await hashPassword(u.password) } : {}),
        ...(u.defaultPlatform !== undefined ? { defaultPlatform: u.defaultPlatform || null } : {}),
        ...(u.calendarSchedulingUrl !== undefined ? { calendarSchedulingUrl: u.calendarSchedulingUrl } : {}),
      });
    }

    if (isSellerAuth(req.auth)) {
      await user.reload();
      return res.json({ user: toProfileUserDto(user), business: null });
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
      user: toProfileUserDto(user),
      business: toBusinessProfileDto(business),
    });
  } catch (err) {
    return next(err);
  }
};

const notificationPreferencesPatchSchema = z
  .object({
    pushEnabled: z.boolean().optional(),
    notifyLeadInterest: z.boolean().optional(),
    notifyEscalations: z.boolean().optional(),
    notifyInboundMessages: z.boolean().optional(),
    // Solo admin: recibir mensajes inbound de leads ya asignados a un vendedor.
    notifyAssignedLeadMessages: z.boolean().optional(),
  })
  .strict();

const NOTIFICATION_PREFERENCE_ATTRIBUTES = [
  "id",
  "pushEnabled",
  "notifyLeadInterest",
  "notifyEscalations",
  "notifyInboundMessages",
  "notifyAssignedLeadMessages",
];

export const getNotificationPreferences = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.auth.userId, { attributes: NOTIFICATION_PREFERENCE_ATTRIBUTES });
    if (!user) throw new ApiError(404, "User not found");
    return res.json(toAccountNotificationPreferencesDto(user, { isAdmin: isAdminAuth(req.auth) }));
  } catch (err) {
    return next(err);
  }
};

export const patchNotificationPreferences = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.auth.userId);
    if (!user) throw new ApiError(404, "User not found");

    const parsed = notificationPreferencesPatchSchema.safeParse(req.body || {});
    if (!parsed.success) throw parsed.error;

    const patch = parsed.data;
    if (patch.notifyAssignedLeadMessages !== undefined && !isAdminAuth(req.auth)) {
      throw new ApiError(403, "Solo el administrador puede cambiar esta preferencia.");
    }
    if (Object.keys(patch).length) {
      await user.update({
        ...(patch.pushEnabled !== undefined ? { pushEnabled: patch.pushEnabled } : {}),
        ...(patch.notifyLeadInterest !== undefined ? { notifyLeadInterest: patch.notifyLeadInterest } : {}),
        ...(patch.notifyEscalations !== undefined ? { notifyEscalations: patch.notifyEscalations } : {}),
        ...(patch.notifyInboundMessages !== undefined ? { notifyInboundMessages: patch.notifyInboundMessages } : {}),
        ...(patch.notifyAssignedLeadMessages !== undefined
          ? { notifyAssignedLeadMessages: patch.notifyAssignedLeadMessages }
          : {}),
      });
    }

    await user.reload({ attributes: NOTIFICATION_PREFERENCE_ATTRIBUTES });
    return res.json(toAccountNotificationPreferencesDto(user, { isAdmin: isAdminAuth(req.auth) }));
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
    // Solo el admin puede eliminar el tenant (los vendedores se dan de baja desde /api/sellers).
    assertAdmin(req.auth);
    const { confirmText } = deleteAccountSchema.parse(req.body || {});
    if (confirmText.toUpperCase() !== "ELIMINAR") {
      throw new ApiError(400, "Debes escribir ELIMINAR para confirmar.");
    }

    const user = await User.findByPk(req.auth.userId);
    if (!user) throw new ApiError(404, "User not found");

    // Los vendedores dependen del tenant: se eliminan junto con el admin.
    await User.destroy({ where: { tenantOwnerUserId: user.id, role: "seller" } });
    await user.destroy();
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
};
