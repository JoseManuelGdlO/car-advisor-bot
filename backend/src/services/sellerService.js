import { z } from "zod";
import { ClientLead, User } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { hashPassword } from "../utils/auth.js";
import { ROLE_SELLER } from "../utils/tenantAccess.js";

const nameSchema = z.string().trim().min(2).max(120);
const emailSchema = z.string().trim().email().max(190);
const passwordSchema = z.string().min(6).max(200);
const phoneSchema = z.string().trim().max(32);

export const createSellerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    phone: phoneSchema.optional().nullable(),
  })
  .strict();

export const patchSellerSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    password: passwordSchema.optional(),
    phone: phoneSchema.optional().nullable(),
  })
  .strict();

export const assignmentSchema = z
  .object({
    assignedSellerUserId: z.string().uuid().nullable(),
  })
  .strict();

export const toSellerDto = (user, { assignedLeadsCount } = {}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone ?? null,
  active: user.active !== false,
  role: ROLE_SELLER,
  createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
  ...(assignedLeadsCount !== undefined ? { assignedLeadsCount } : {}),
});

/** Busca un vendedor del tenant (activo o no); 404 si no existe, es admin o es de otro tenant. */
export const findTenantSellerOr404 = async (tenantOwnerUserId, sellerId) => {
  const seller = await User.findOne({
    where: { id: sellerId, role: ROLE_SELLER, tenantOwnerUserId },
  });
  if (!seller) throw new ApiError(404, "Vendedor no encontrado");
  return seller;
};

const assertEmailAvailable = async (email, exceptUserId = null) => {
  const existing = await User.findOne({ where: { email } });
  if (existing && existing.id !== exceptUserId) {
    throw new ApiError(409, "Ya existe una cuenta con este correo.");
  }
};

const countAssignedLeads = async (tenantOwnerUserId, sellerId) =>
  ClientLead.count({ where: { ownerUserId: tenantOwnerUserId, assignedSellerUserId: sellerId } });

export const listSellers = async ({ tenantOwnerUserId, includeInactive = false }) => {
  const where = { role: ROLE_SELLER, tenantOwnerUserId };
  if (!includeInactive) where.active = true;
  const rows = await User.findAll({ where, order: [["name", "ASC"]] });
  return Promise.all(
    rows.map(async (row) =>
      toSellerDto(row, { assignedLeadsCount: await countAssignedLeads(tenantOwnerUserId, row.id) }),
    ),
  );
};

export const getSeller = async ({ tenantOwnerUserId, sellerId }) => {
  const seller = await findTenantSellerOr404(tenantOwnerUserId, sellerId);
  return toSellerDto(seller, { assignedLeadsCount: await countAssignedLeads(tenantOwnerUserId, seller.id) });
};

export const createSeller = async ({ tenantOwnerUserId, input }) => {
  await assertEmailAvailable(input.email);
  const seller = await User.create({
    email: input.email,
    name: input.name,
    phone: input.phone || null,
    passwordHash: await hashPassword(input.password),
    role: ROLE_SELLER,
    tenantOwnerUserId,
    // Los vendedores no tienen calendario propio: el bot lee el del admin.
    calendarSchedulingUrl: null,
    active: true,
  });
  return toSellerDto(seller, { assignedLeadsCount: 0 });
};

export const updateSeller = async ({ tenantOwnerUserId, sellerId, input }) => {
  const seller = await findTenantSellerOr404(tenantOwnerUserId, sellerId);
  if (input.email !== undefined && input.email !== seller.email) {
    await assertEmailAvailable(input.email, seller.id);
  }
  await seller.update({
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
    ...(input.password !== undefined ? { passwordHash: await hashPassword(input.password) } : {}),
  });
  return toSellerDto(seller, { assignedLeadsCount: await countAssignedLeads(tenantOwnerUserId, seller.id) });
};

/**
 * Baja lógica: active=false + desasigna sus leads. Nunca destruye la fila.
 * @returns {{ seller: object, unassignedLeads: number }}
 */
export const deactivateSeller = async ({ tenantOwnerUserId, sellerId }) => {
  const seller = await findTenantSellerOr404(tenantOwnerUserId, sellerId);
  if (seller.active === false) throw new ApiError(409, "El vendedor ya está dado de baja.");
  await seller.update({ active: false });
  const [unassignedLeads] = await ClientLead.update(
    { assignedSellerUserId: null },
    { where: { ownerUserId: tenantOwnerUserId, assignedSellerUserId: seller.id } },
  );
  return { seller: toSellerDto(seller, { assignedLeadsCount: 0 }), unassignedLeads };
};

/** Reactiva al vendedor sin reasignar leads. */
export const restoreSeller = async ({ tenantOwnerUserId, sellerId }) => {
  const seller = await findTenantSellerOr404(tenantOwnerUserId, sellerId);
  if (seller.active !== false) throw new ApiError(409, "El vendedor ya está activo.");
  await seller.update({ active: true });
  return toSellerDto(seller, { assignedLeadsCount: 0 });
};

/** Valida que el vendedor sea asignable: mismo tenant, role=seller, active=true. */
export const resolveAssignableSeller = async (tenantOwnerUserId, sellerId) => {
  const seller = await findTenantSellerOr404(tenantOwnerUserId, sellerId);
  if (seller.active === false) {
    throw new ApiError(400, "No se puede asignar un lead a un vendedor dado de baja.");
  }
  return seller;
};
