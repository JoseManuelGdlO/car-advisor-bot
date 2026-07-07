import { ChannelCredential, ChannelIntegration } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import { decryptCredentialsPayload } from "../utils/credentialsCrypto.js";

const WHATSAPP_PROVIDER = "whatsapp-connect";

const assertWhatsAppConnectIntegration = (integration) => {
  if (!integration || integration.status === "eliminated") throw new ApiError(404, "Integration not found");
  if (integration.channel !== "whatsapp") throw new ApiError(400, "Integration channel must be whatsapp");
  if (integration.provider !== WHATSAPP_PROVIDER) throw new ApiError(400, "Integration provider must be whatsapp-connect");
};

const getActiveCredentialPayload = async (ownerUserId, channelIntegrationId) => {
  const cred = await ChannelCredential.findOne({
    where: { ownerUserId, channelIntegrationId, isActive: true },
    order: [["updatedAt", "DESC"]],
  });
  if (!cred) throw new ApiError(400, "No active credentials for integration");
  try {
    return decryptCredentialsPayload(cred.cipherText);
  } catch {
    throw new ApiError(400, "Active credentials are invalid");
  }
};

const normalizeWcCredentials = (payload = {}) => ({
  webhookSecret: String(payload.webhookSecret || "").trim(),
  deviceId: String(payload.deviceId || "").trim(),
  tenantId: String(payload.tenantId || "").trim() || null,
});

export const resolveWhatsappConnectIntegrationById = async ({ ownerUserId, integrationId }) => {
  // Resuelve la integración del usuario autenticado y su credencial activa descifrada.
  const integration = await ChannelIntegration.findOne({
    where: { id: integrationId, ownerUserId },
  });
  assertWhatsAppConnectIntegration(integration);
  const credentialsPayload = await getActiveCredentialPayload(ownerUserId, integration.id);
  return {
    integration,
    credentials: normalizeWcCredentials(credentialsPayload),
  };
};

export const resolveInstagramMetaIntegrationById = async ({ ownerUserId, integrationId }) => {
  const integration = await ChannelIntegration.findOne({
    where: { id: integrationId, ownerUserId },
  });
  if (!integration || integration.status === "eliminated") throw new ApiError(404, "Integration not found");
  if (integration.channel !== "instagram") throw new ApiError(400, "Integration channel must be instagram");
  if (integration.provider !== META_PROVIDER) throw new ApiError(400, "Integration provider must be meta");
  const credentialsPayload = await getActiveCredentialPayload(ownerUserId, integration.id);
  const credentials = normalizeInstagramMetaCredentials(credentialsPayload);
  if (!credentials.pageId || !credentials.pageAccessToken) {
    throw new ApiError(400, "Instagram integration is missing required credentials");
  }
  return { integration, credentials };
};

export const resolveWhatsappConnectIntegrationByDevice = async ({ deviceId }) => {
  // Resolve fallback para webhooks públicos cuando sólo llega deviceId.
  const integrations = await ChannelIntegration.findAll({
    where: { channel: "whatsapp", provider: WHATSAPP_PROVIDER, status: "active" },
    order: [["updatedAt", "DESC"]],
  });

  for (const integration of integrations) {
    try {
      const payload = await getActiveCredentialPayload(integration.ownerUserId, integration.id);
      const credentials = normalizeWcCredentials(payload);
      if (credentials.deviceId && credentials.deviceId === String(deviceId || "").trim()) {
        return { integration, credentials };
      }
    } catch {
      // Ignore invalid credential rows and continue scanning.
    }
  }

  throw new ApiError(404, "No active whatsapp-connect integration for device");
};

const META_PROVIDER = "meta";

export const normalizeInstagramMetaCredentials = (payload = {}) => ({
  instagramBusinessAccountId: String(payload.instagramBusinessAccountId || "").trim(),
  pageId: String(payload.pageId || "").trim(),
  pageAccessToken: String(payload.pageAccessToken || "").trim(),
});

// Cada vendedor (ownerUserId) tiene su fila channel_integrations + credenciales; el id de negocio de IG del webhook elige a quién pertenece el mensaje.
export const resolveInstagramMetaIntegrationByBusinessAccountId = async ({ instagramBusinessAccountId }) => {
  const target = String(instagramBusinessAccountId || "").trim();
  if (!target) throw new ApiError(400, "Missing Instagram business account id");

  const integrations = await ChannelIntegration.findAll({
    where: { channel: "instagram", provider: META_PROVIDER, status: "active" },
    order: [["updatedAt", "DESC"]],
  });

  for (const integration of integrations) {
    try {
      const payload = await getActiveCredentialPayload(integration.ownerUserId, integration.id);
      const credentials = normalizeInstagramMetaCredentials(payload);
      if (credentials.instagramBusinessAccountId && credentials.instagramBusinessAccountId === target) {
        if (!credentials.pageId || !credentials.pageAccessToken) {
          continue;
        }
        return { integration, credentials };
      }
    } catch {
      // Ignore invalid credential rows and continue scanning.
    }
  }

  throw new ApiError(404, "No active instagram meta integration for this account");
};
