import { ChannelCredential, ChannelIntegration } from "../models/index.js";
import { decryptCredentialsPayload } from "./credentialsCrypto.js";

const CHANNELS_REQUIRING_CONFIG = new Set(["whatsapp", "facebook", "telegram"]);

/**
 * @param {string | undefined} platform
 */
export const normalizeInboundChannel = (platform) => {
  const p = String(platform || "api")
    .toLowerCase()
    .trim();
  if (["whatsapp", "facebook", "telegram", "web", "api"].includes(p)) return p;
  return "api";
};

/**
 * Si no hay fila de integración para el canal, se permite (compatibilidad).
 * Si hay fila, debe estar active y con credencial activa descifrable.
 * @param {string} ownerUserId
 * @param {string | undefined} platform
 */
export const channelAllowsAutoReply = async (ownerUserId, platform) => {
  const ch = normalizeInboundChannel(platform);
  if (!CHANNELS_REQUIRING_CONFIG.has(ch)) return true;
  const integration = await ChannelIntegration.findOne({ where: { ownerUserId, channel: ch } });
  if (!integration) return true;
  if (integration.status !== "active") return false;
  const cred = await ChannelCredential.findOne({
    where: { ownerUserId, channelIntegrationId: integration.id, isActive: true },
  });
  if (!cred) return false;
  try {
    decryptCredentialsPayload(cred.cipherText);
    return true;
  } catch {
    return false;
  }
};
