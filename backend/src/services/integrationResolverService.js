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
export const WHATSAPP_CHANNEL = "whatsapp";
export const META_WHATSAPP_PROVIDER = "meta";

export const normalizeInstagramMetaCredentials = (payload = {}) => ({
  instagramBusinessAccountId: String(payload.instagramBusinessAccountId || "").trim(),
  pageId: String(payload.pageId || "").trim(),
  pageAccessToken: String(payload.pageAccessToken || "").trim(),
});

export const normalizeMetaCredentials = (payload = {}) => ({
  businessId: String(payload.businessId || payload.metaBusinessId || "").trim() || null,
  wabaId: String(payload.wabaId || "").trim() || null,
  phoneNumberId: String(payload.phoneNumberId || "").trim() || null,
  displayPhoneNumber: String(payload.displayPhoneNumber || "").trim() || null,
  accessToken: String(payload.accessToken || "").trim(),
  coexistenceEnabled: Boolean(payload.coexistenceEnabled),
});

const metaCredentialsFromIntegration = (integration, payload = {}) =>
  normalizeMetaCredentials({
    ...payload,
    wabaId: integration.wabaId || payload.wabaId,
    phoneNumberId: integration.phoneNumberId || payload.phoneNumberId,
    displayPhoneNumber: integration.displayPhoneNumber || payload.displayPhoneNumber,
    coexistenceEnabled: integration.coexistenceEnabled || payload.coexistenceEnabled,
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

export const resolveMetaWhatsappIntegrationById = async ({ ownerUserId, integrationId }) => {
  const integration = await ChannelIntegration.findOne({
    where: { id: integrationId, ownerUserId },
  });
  if (!integration || integration.status === "eliminated") throw new ApiError(404, "Integration not found");
  if (integration.channel !== WHATSAPP_CHANNEL) throw new ApiError(400, "Integration channel must be whatsapp");
  if (integration.provider !== META_WHATSAPP_PROVIDER) throw new ApiError(400, "Integration provider must be meta");
  const credentialsPayload = await getActiveCredentialPayload(ownerUserId, integration.id);
  const credentials = metaCredentialsFromIntegration(integration, credentialsPayload);
  if (!credentials.phoneNumberId || !credentials.accessToken) {
    throw new ApiError(400, "WhatsApp integration is missing required credentials");
  }
  return { integration, credentials };
};

export const resolveMetaWhatsappByPhoneNumberId = async ({ phoneNumberId }) => {
  const target = String(phoneNumberId || "").trim();
  if (!target) throw new ApiError(400, "Missing WhatsApp phone number id");

  const byColumn = await ChannelIntegration.findOne({
    where: {
      channel: WHATSAPP_CHANNEL,
      provider: META_WHATSAPP_PROVIDER,
      status: "active",
      phoneNumberId: target,
    },
    order: [["updatedAt", "DESC"]],
  });
  if (byColumn) {
    try {
      const credentialsPayload = await getActiveCredentialPayload(byColumn.ownerUserId, byColumn.id);
      const credentials = metaCredentialsFromIntegration(byColumn, credentialsPayload);
      if (credentials.phoneNumberId && credentials.accessToken) {
        return {
          integration: byColumn,
          credentials,
          provider: META_WHATSAPP_PROVIDER,
        };
      }
    } catch {
      // Missing/invalid credentials must not 400 inbound webhooks; continue ciphertext fallback.
    }
  }

  const integrations = await ChannelIntegration.findAll({
    where: { channel: WHATSAPP_CHANNEL, provider: META_WHATSAPP_PROVIDER, status: "active" },
    order: [["updatedAt", "DESC"]],
  });
  for (const integration of integrations) {
    try {
      const payload = await getActiveCredentialPayload(integration.ownerUserId, integration.id);
      const credentials = normalizeMetaCredentials(payload);
      if (credentials.phoneNumberId && credentials.phoneNumberId === target && credentials.accessToken) {
        return { integration, credentials, provider: META_WHATSAPP_PROVIDER };
      }
    } catch {
      // Ignore invalid credential rows and continue scanning.
    }
  }

  throw new ApiError(404, "No active meta whatsapp integration for this phone_number_id");
};

export const assertPhoneNumberIdExclusiveToOwner = async ({ phoneNumberId, ownerUserId }) => {
  const target = String(phoneNumberId || "").trim();
  if (!target) throw new ApiError(400, "phoneNumberId es obligatorio.");

  const others = await ChannelIntegration.findAll({
    where: {
      channel: WHATSAPP_CHANNEL,
      provider: META_WHATSAPP_PROVIDER,
      status: "active",
      phoneNumberId: target,
    },
  });
  if (others.some((row) => row.ownerUserId !== ownerUserId)) {
    throw new ApiError(409, "Este número de WhatsApp ya está vinculado a otra cuenta.");
  }

  const integrations = await ChannelIntegration.findAll({
    where: { channel: WHATSAPP_CHANNEL, provider: META_WHATSAPP_PROVIDER, status: "active" },
    order: [["updatedAt", "DESC"]],
  });
  for (const integration of integrations) {
    if (integration.ownerUserId === ownerUserId) continue;
    try {
      const payload = await getActiveCredentialPayload(integration.ownerUserId, integration.id);
      const credentials = normalizeMetaCredentials(payload);
      if (credentials.phoneNumberId && credentials.phoneNumberId === target) {
        throw new ApiError(409, "Este número de WhatsApp ya está vinculado a otra cuenta.");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) throw error;
    }
  }
};
