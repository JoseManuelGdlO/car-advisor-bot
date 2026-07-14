/**
 * Preferencias de push del owner y filtro por notification_kind.
 */

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  pushEnabled: true,
  notifyLeadInterest: true,
  notifyEscalations: true,
  notifyInboundMessages: true,
});

export const toNotificationPreferencesDto = (user) => ({
  pushEnabled: user?.pushEnabled !== false,
  notifyLeadInterest: user?.notifyLeadInterest !== false,
  notifyEscalations: user?.notifyEscalations !== false,
  notifyInboundMessages: user?.notifyInboundMessages !== false,
});

/**
 * Decide si un push debe enviarse según prefs del owner y el kind.
 * Kinds desconocidos/vacíos solo respetan el master.
 *
 * @param {{ prefs: { pushEnabled?: boolean, notifyLeadInterest?: boolean, notifyEscalations?: boolean, notifyInboundMessages?: boolean }, kind?: string | null }} args
 * @returns {{ deliver: boolean, skippedReason?: string }}
 */
export const shouldDeliverPush = ({ prefs, kind }) => {
  const resolved = toNotificationPreferencesDto(prefs);
  if (!resolved.pushEnabled) {
    return { deliver: false, skippedReason: "push_disabled" };
  }

  const normalizedKind = String(kind || "").trim();
  if (!normalizedKind) {
    return { deliver: true };
  }

  if (normalizedKind === "lead_interest") {
    if (!resolved.notifyLeadInterest) {
      return { deliver: false, skippedReason: "kind_disabled" };
    }
    return { deliver: true };
  }

  if (normalizedKind === "human_advisor" || normalizedKind === "financing_detail_help") {
    if (!resolved.notifyEscalations) {
      return { deliver: false, skippedReason: "kind_disabled" };
    }
    return { deliver: true };
  }

  if (normalizedKind === "new_inbound_message") {
    if (!resolved.notifyInboundMessages) {
      return { deliver: false, skippedReason: "kind_disabled" };
    }
    return { deliver: true };
  }

  return { deliver: true };
};
