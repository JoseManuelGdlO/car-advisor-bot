import { Op } from "sequelize";
import { ChannelConversationContext, ClientLead, Conversation, User } from "../models/index.js";
import { appLog } from "../utils/appLogger.js";
import { blacklistPhoneLookupValues, normalizeBlacklistPhone } from "../utils/whatsappIdentity.js";

export const NEW_INBOUND_MESSAGE_KIND = "new_inbound_message";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Reglas de destinatarios (puro, sin DB):
 * - Lead asignado: vendedor + admin.
 * - Lead sin asignar: solo admin.
 * - Excepción: mensaje inbound de lead asignado y admin con
 *   `notifyAssignedLeadMessages === false` => solo vendedor.
 * Las escalaciones (human_advisor, financing_detail_help, lead_interest) siempre incluyen al admin.
 */
export const computeRecipientUserIds = ({
  adminUserId,
  assignedSellerUserId = null,
  adminNotifyAssignedLeadMessages = true,
  kind = "",
}) => {
  const hasSeller = Boolean(assignedSellerUserId);
  const adminOptedOut =
    hasSeller && String(kind || "").trim() === NEW_INBOUND_MESSAGE_KIND && adminNotifyAssignedLeadMessages === false;
  const ids = [];
  if (!adminOptedOut) ids.push(adminUserId);
  if (hasSeller && assignedSellerUserId !== adminUserId) ids.push(assignedSellerUserId);
  return ids;
};

const findLeadByPhone = async (ownerUserId, rawPhone) => {
  const normalized = normalizeBlacklistPhone(rawPhone);
  if (!normalized) return null;
  const values = blacklistPhoneLookupValues(normalized);
  return ClientLead.findOne({
    where: {
      ownerUserId,
      [Op.or]: [{ phone: { [Op.in]: values } }, { displayPhone: { [Op.in]: values } }],
    },
    order: [["updatedAt", "DESC"]],
  });
};

/**
 * Ubica el lead (best-effort, siempre dentro del tenant), en orden de confianza:
 * leadId → conversationId → id externo del canal (`channelUserId`) → teléfono.
 */
export const findLeadForNotification = async ({
  ownerUserId,
  leadId,
  conversationId,
  channelUserId,
  customerPhone,
}) => {
  if (leadId) {
    return ClientLead.findOne({ where: { id: leadId, ownerUserId } });
  }
  const convId = String(conversationId || "").trim();
  if (convId && UUID_RE.test(convId)) {
    const conversation = await Conversation.findOne({
      where: { id: convId, ownerUserId },
      attributes: ["id", "clientLeadId"],
    });
    if (conversation?.clientLeadId) {
      const lead = await ClientLead.findOne({ where: { id: conversation.clientLeadId, ownerUserId } });
      if (lead) return lead;
    }
  }
  const externalId = String(channelUserId || "").trim();
  if (externalId) {
    // El bot conoce el id del canal (p. ej. teléfono de WhatsApp) aunque el cliente no haya dado su teléfono.
    const context = await ChannelConversationContext.findOne({
      where: { ownerUserId, externalUserId: externalId },
      order: [["lastSeenAt", "DESC"]],
      attributes: ["id", "conversationId", "clientLeadId"],
    });
    if (context?.clientLeadId) {
      const lead = await ClientLead.findOne({ where: { id: context.clientLeadId, ownerUserId } });
      if (lead) return lead;
    }
    if (context?.conversationId) {
      const conversation = await Conversation.findOne({
        where: { id: context.conversationId, ownerUserId },
        attributes: ["id", "clientLeadId"],
      });
      if (conversation?.clientLeadId) {
        const lead = await ClientLead.findOne({ where: { id: conversation.clientLeadId, ownerUserId } });
        if (lead) return lead;
      }
    }
    const byExternalPhone = await findLeadByPhone(ownerUserId, externalId);
    if (byExternalPhone) return byExternalPhone;
  }
  return findLeadByPhone(ownerUserId, customerPhone);
};

/**
 * Resuelve los userIds receptores para un evento de un tenant.
 * @returns {Promise<{ recipientUserIds: string[], assignedSellerUserId: string|null }>}
 */
export const resolveNotificationRecipients = async ({
  ownerUserId,
  kind,
  lead = null,
  leadId,
  conversationId,
  channelUserId,
  customerPhone,
}) => {
  const resolvedLead =
    lead || (await findLeadForNotification({ ownerUserId, leadId, conversationId, channelUserId, customerPhone }));
  if (!resolvedLead) {
    // Sin lead no se puede saber si hay vendedor asignado: queda solo el admin. Se deja rastro para diagnosticar.
    appLog.warn(
      "notificationRecipients",
      `lead not resolved, notifying admin only kind=${kind || "n/a"} ownerUserId=${ownerUserId} ` +
        `hasLeadId=${Boolean(leadId)} hasConversationId=${Boolean(String(conversationId || "").trim())} ` +
        `hasChannelUserId=${Boolean(String(channelUserId || "").trim())} hasCustomerPhone=${Boolean(String(customerPhone || "").trim())}`,
    );
  }

  let assignedSellerUserId = null;
  if (resolvedLead?.assignedSellerUserId) {
    const seller = await User.findOne({
      where: { id: resolvedLead.assignedSellerUserId, role: "seller", tenantOwnerUserId: ownerUserId },
      attributes: ["id", "active"],
    });
    // Vendedor dado de baja: sus leads se desasignan, pero por seguridad no se le notifica.
    if (seller && seller.active !== false) assignedSellerUserId = seller.id;
  }

  let adminNotifyAssignedLeadMessages = true;
  if (assignedSellerUserId) {
    const admin = await User.findByPk(ownerUserId, { attributes: ["id", "notifyAssignedLeadMessages"] });
    adminNotifyAssignedLeadMessages = admin?.notifyAssignedLeadMessages !== false;
  }

  return {
    assignedSellerUserId,
    recipientUserIds: computeRecipientUserIds({
      adminUserId: ownerUserId,
      assignedSellerUserId,
      adminNotifyAssignedLeadMessages,
      kind,
    }),
  };
};
