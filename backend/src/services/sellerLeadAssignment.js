import { ClientLead, User } from "../models/index.js";
import { isWithinBotSchedule } from "../utils/botSettings.js";
import { ROLE_SELLER } from "../utils/tenantAccess.js";
import { getOrCreateBotSettings } from "./botSettingsService.js";

const DEFAULT_TIMEZONE = "America/Mexico_City";

export const ESCALATION_AUTO_ASSIGN_KINDS = new Set(["human_advisor", "financing_detail_help", "lead_interest"]);

export const sellerLeadAssignmentDeps = {
  getOrCreateBotSettings,
  listAssignableSellers: async (ownerUserId) =>
    User.findAll({
      where: { role: ROLE_SELLER, tenantOwnerUserId: ownerUserId, active: true },
    }),
};

export const pickSellerForAutoAssign = (sellers, { now = new Date(), timezone, random = Math.random } = {}) => {
  const tz = timezone || DEFAULT_TIMEZONE;
  const eligible = (sellers || []).filter((seller) =>
    seller?.active !== false &&
    isWithinBotSchedule(
      {
        isEnabled: Boolean(seller?.autoAssignLeads),
        timezone: tz,
        weeklySchedule: seller?.weeklySchedule,
      },
      now,
    ),
  );
  if (!eligible.length) return null;
  if (eligible.length === 1) return eligible[0];
  const index = Math.min(eligible.length - 1, Math.floor(Number(random()) * eligible.length));
  return eligible[index];
};

/** Asigna un vendedor en horario si el lead aún no tiene uno. Idempotente. */
export const maybeAutoAssignLead = async (lead, { ownerUserId, now } = {}) => {
  if (!lead || lead.assignedSellerUserId) return lead;
  const settings = await sellerLeadAssignmentDeps.getOrCreateBotSettings(ownerUserId);
  const sellers = await sellerLeadAssignmentDeps.listAssignableSellers(ownerUserId);
  const picked = pickSellerForAutoAssign(sellers, {
    now,
    timezone: settings?.timezone || DEFAULT_TIMEZONE,
  });
  if (!picked) return lead;
  // WHERE assigned_seller_user_id IS NULL: dos escalaciones (o un PATCH en medio) no se pisan.
  const [affected] = await ClientLead.update(
    { assignedSellerUserId: picked.id },
    { where: { id: lead.id, assignedSellerUserId: null } },
  );
  if (!affected) {
    await lead.reload();
    return lead;
  }
  lead.assignedSellerUserId = picked.id;
  if (typeof lead.changed === "function") lead.changed("assignedSellerUserId", false);
  return lead;
};
