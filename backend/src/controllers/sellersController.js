import { ApiError } from "../utils/errors.js";
import { assertAdmin, resolveTenantOwnerId } from "../utils/tenantAccess.js";
import {
  createSeller,
  createSellerSchema,
  deactivateSeller,
  getSeller,
  listSellers,
  patchSellerLeadScheduleSchema,
  patchSellerSchema,
  restoreSeller,
  updateSeller,
  updateSellerLeadSchedule,
} from "../services/sellerService.js";

const isTruthyFlag = (value) => ["1", "true", "yes"].includes(String(value ?? "").trim().toLowerCase());

const tenantForAdmin = (req) => {
  assertAdmin(req.auth);
  return resolveTenantOwnerId(req);
};

export const listSellersHandler = async (req, res) => {
  const tenantOwnerUserId = tenantForAdmin(req);
  const items = await listSellers({
    tenantOwnerUserId,
    includeInactive: isTruthyFlag(req.query?.includeInactive),
  });
  return res.json(items);
};

export const getSellerHandler = async (req, res) => {
  const tenantOwnerUserId = tenantForAdmin(req);
  return res.json(await getSeller({ tenantOwnerUserId, sellerId: req.params.id }));
};

export const createSellerHandler = async (req, res) => {
  const tenantOwnerUserId = tenantForAdmin(req);
  const input = createSellerSchema.parse(req.body || {});
  return res.status(201).json(await createSeller({ tenantOwnerUserId, input }));
};

export const patchSellerHandler = async (req, res) => {
  const tenantOwnerUserId = tenantForAdmin(req);
  const input = patchSellerSchema.parse(req.body || {});
  if (!Object.keys(input).length) throw new ApiError(400, "No hay cambios para aplicar.");
  return res.json(await updateSeller({ tenantOwnerUserId, sellerId: req.params.id, input }));
};

export const deleteSellerHandler = async (req, res) => {
  const tenantOwnerUserId = tenantForAdmin(req);
  const { seller, unassignedLeads } = await deactivateSeller({ tenantOwnerUserId, sellerId: req.params.id });
  return res.json({ ok: true, seller, unassignedLeads });
};

export const restoreSellerHandler = async (req, res) => {
  const tenantOwnerUserId = tenantForAdmin(req);
  const seller = await restoreSeller({ tenantOwnerUserId, sellerId: req.params.id });
  return res.json({ ok: true, seller });
};

export const patchSellerLeadScheduleHandler = async (req, res) => {
  const tenantOwnerUserId = tenantForAdmin(req);
  const parsed = patchSellerLeadScheduleSchema.safeParse(req.body || {});
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues?.[0]?.message || "No hay cambios para aplicar.");
  }
  return res.json(
    await updateSellerLeadSchedule({
      tenantOwnerUserId,
      sellerId: req.params.id,
      input: parsed.data,
    }),
  );
};
