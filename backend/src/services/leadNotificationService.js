import { sendPushToOwner } from "./pushService.js";
import { resolveNotificationRecipients } from "./notificationRecipients.js";

export const leadNotificationDeps = {
  sendPushToOwner,
  resolveNotificationRecipients,
};

/**
 * Envía push + inbox a todos los receptores de un evento de lead:
 * vendedor asignado y/o admin del tenant (ver `computeRecipientUserIds`).
 * Cada receptor aplica sus propias preferencias (`pushEnabled`, flags por kind) y
 * su inbox/dispositivos quedan ligados a su propio userId.
 */
export const sendPushToLeadRecipients = async ({
  ownerUserId,
  lead = null,
  leadId,
  conversationId,
  channelUserId,
  customerPhone,
  title,
  body,
  data = {},
}) => {
  const kind = data?.notification_kind ?? data?.notificationKind ?? "";
  let recipientUserIds = [ownerUserId];
  try {
    const resolved = await leadNotificationDeps.resolveNotificationRecipients({
      ownerUserId,
      kind,
      lead,
      leadId,
      conversationId: conversationId ?? data?.conversationId ?? data?.conversation_id,
      channelUserId: channelUserId ?? data?.channelUserId ?? data?.channel_user_id,
      customerPhone: customerPhone ?? data?.customer_phone,
    });
    recipientUserIds = resolved.recipientUserIds;
  } catch (error) {
    // Ante un fallo resolviendo vendedor, el admin nunca se queda sin aviso.
    console.error("[leadNotificationService] recipient resolution failed", String(error?.message || ""));
  }

  const results = [];
  for (const recipientUserId of recipientUserIds) {
    const result = await leadNotificationDeps.sendPushToOwner({
      ownerUserId: recipientUserId,
      title,
      body,
      data,
    });
    results.push({ userId: recipientUserId, ...result });
  }

  return {
    sentCount: results.reduce((sum, r) => sum + (r.sentCount || 0), 0),
    failedCount: results.reduce((sum, r) => sum + (r.failedCount || 0), 0),
    deactivatedCount: results.reduce((sum, r) => sum + (r.deactivatedCount || 0), 0),
    recipientCount: recipientUserIds.length,
    recipientUserIds,
    results,
  };
};
