import { Op } from "sequelize";
import { env } from "../config/env.js";
import { ChannelCredential, ChannelIntegration } from "../models/index.js";
import { decryptCredentialsPayload, encryptCredentialsPayload } from "../utils/credentialsCrypto.js";
import { ApiError } from "../utils/errors.js";
import { embeddedSignupRedirectUri } from "../utils/publicUrl.js";
import {
  META_WHATSAPP_PROVIDER,
  WHATSAPP_CHANNEL,
  assertPhoneNumberIdExclusiveToOwner,
  normalizeMetaCredentials,
} from "./integrationResolverService.js";
import {
  describeGraphToken,
  exchangeEmbeddedSignupCode,
  ensurePlatformCanManageWaba,
  getPhoneNumberDetails,
  initiateCoexistenceSync,
  inspectGraphToken,
  listWabaPhoneNumbers,
  subscribeWabaApp,
  unsubscribeWabaApp,
} from "./metaGraphClient.js";
import { ensureFollowupDefaultTemplate } from "./whatsappFollowupTemplateService.js";

const quietTest = process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);

function logInfo(message, fields) {
  if (quietTest) return;
  console.info(`[meta-signup] ${message}`, fields ?? "");
}

function logWarn(message, fields) {
  if (quietTest) return;
  console.warn(`[meta-signup] ${message}`, fields ?? "");
}

export function publicMetaSignupConfig() {
  const appId = String(env.meta.appId || "").trim();
  const configId = String(env.meta.configId || "").trim();
  const graphVersion = String(env.meta.graphApiVersion || "v21.0");
  return {
    configured: Boolean(appId && configId && String(env.meta.appSecret || "").trim()),
    appId,
    configId,
    graphVersion,
    featureType: "whatsapp_business_app_onboarding",
    sessionInfoVersion: "3",
  };
}

function pickPhoneFromList(phones, preferredId) {
  if (!phones.length) return null;
  if (preferredId) {
    const match = phones.find((row) => String(row.id) === String(preferredId));
    if (match) return match;
  }
  return phones[0];
}

async function upsertMetaIntegration({ ownerUserId, wabaId, phoneNumberId, displayPhoneNumber, coexistenceEnabled }) {
  const existing = await ChannelIntegration.findOne({
    where: {
      ownerUserId,
      channel: WHATSAPP_CHANNEL,
      provider: META_WHATSAPP_PROVIDER,
    },
  });
  const patch = {
    displayName: displayPhoneNumber ? `WhatsApp ${displayPhoneNumber}` : "WhatsApp Cloud API",
    status: "active",
    lastError: null,
    wabaId,
    phoneNumberId,
    displayPhoneNumber,
    coexistenceEnabled,
  };
  if (!existing) {
    return ChannelIntegration.create({
      ownerUserId,
      channel: WHATSAPP_CHANNEL,
      provider: META_WHATSAPP_PROVIDER,
      ...patch,
    });
  }
  await existing.update(patch);
  return existing;
}

async function replaceMetaCredentials({ ownerUserId, integrationId, payload }) {
  await ChannelCredential.update(
    { isActive: false },
    { where: { ownerUserId, channelIntegrationId: integrationId } },
  );
  await ChannelCredential.create({
    ownerUserId,
    channelIntegrationId: integrationId,
    credentialType: "json_secrets",
    cipherText: encryptCredentialsPayload(payload),
    isActive: true,
  });
}

export async function completeEmbeddedSignup({
  ownerUserId,
  code,
  wabaId,
  phoneNumberId,
  businessId,
  event,
  ensureFollowupDefault = ensureFollowupDefaultTemplate,
} = {}) {
  const config = publicMetaSignupConfig();
  if (!config.configured) {
    throw new ApiError(503, "Embedded Signup no está configurado en el servidor.");
  }
  const exchangeCode = String(code || "").trim();
  if (!exchangeCode) throw new ApiError(400, "Falta el código de Embedded Signup.");
  let resolvedWabaId = String(wabaId || "").trim();

  const coexistenceByEvent = String(event || "").toUpperCase() === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";
  logInfo("embedded signup: intercambiando código", {
    ownerUserId,
    hasWabaId: Boolean(resolvedWabaId),
    hasPhoneNumberId: Boolean(phoneNumberId),
    event: event || null,
  });

  const { accessToken } = await exchangeEmbeddedSignupCode(exchangeCode, embeddedSignupRedirectUri());
  const described = describeGraphToken(accessToken);
  logInfo("embedded signup: token intercambiado", {
    ownerUserId,
    tokenSource: described.source,
    equalsPlatform: described.equalsPlatform,
    ...(env.meta.debugGraphToken ? { tokenPreview: described.preview } : {}),
  });

  let inspection = null;
  try {
    inspection = await inspectGraphToken(accessToken);
    logInfo("embedded signup: token inspeccionado", {
      ownerUserId,
      type: inspection.type,
      isValid: inspection.isValid,
      expiresAt: inspection.expiresAt,
      dataAccessExpiresAt: inspection.dataAccessExpiresAt,
      targetIds: inspection.targetIds,
    });
    if (described.equalsPlatform || String(inspection.type || "").toUpperCase() === "SYSTEM_USER") {
      logWarn("embedded signup: el token intercambiado no parece User Access Token del cliente", {
        ownerUserId,
        type: inspection.type,
        equalsPlatform: described.equalsPlatform,
      });
    }
  } catch (error) {
    logWarn("embedded signup: no se pudo inspeccionar el token", {
      ownerUserId,
      message: error.message,
    });
  }

  if (!resolvedWabaId) {
    const ids = Array.isArray(inspection?.targetIds)
      ? inspection.targetIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    if (ids.length === 1) resolvedWabaId = ids[0];
  }
  if (!resolvedWabaId) {
    throw new ApiError(400, "Meta no devolvió el WABA ID. Completa de nuevo el flujo.");
  }

  await subscribeWabaApp(resolvedWabaId, accessToken);
  logInfo("embedded signup: WABA suscrita a webhooks", { ownerUserId, wabaId: resolvedWabaId });
  await ensurePlatformCanManageWaba({ wabaId: resolvedWabaId });

  const phones = await listWabaPhoneNumbers(resolvedWabaId, accessToken);
  let phone = pickPhoneFromList(phones, phoneNumberId);
  if (!phone && phoneNumberId) {
    phone = await getPhoneNumberDetails(phoneNumberId, accessToken);
  }
  if (!phone?.id) {
    throw new ApiError(400, "No se encontró un número de WhatsApp en la cuenta conectada.");
  }

  let details = phone;
  try {
    details = await getPhoneNumberDetails(phone.id, accessToken);
  } catch (error) {
    logWarn("embedded signup: no se pudieron leer detalles del número", {
      phoneNumberId: phone.id,
      message: error.message,
    });
  }

  const coexistenceEnabled =
    coexistenceByEvent || (details.is_on_biz_app === true && details.platform_type === "CLOUD_API");
  const displayPhoneNumber = String(details.display_phone_number || phone.display_phone_number || "").trim() || null;

  await assertPhoneNumberIdExclusiveToOwner({ phoneNumberId: phone.id, ownerUserId });

  const credentials = normalizeMetaCredentials({
    businessId,
    wabaId: resolvedWabaId,
    phoneNumberId: String(phone.id),
    displayPhoneNumber,
    accessToken,
    coexistenceEnabled,
  });

  const integration = await upsertMetaIntegration({
    ownerUserId,
    wabaId: resolvedWabaId,
    phoneNumberId: credentials.phoneNumberId,
    displayPhoneNumber,
    coexistenceEnabled,
  });
  await replaceMetaCredentials({
    ownerUserId,
    integrationId: integration.id,
    payload: credentials,
  });

  if (coexistenceEnabled) {
    try {
      await initiateCoexistenceSync({
        phoneNumberId: credentials.phoneNumberId,
        token: accessToken,
        syncType: "smb_app_state_sync",
      });
      logInfo("embedded signup: sync de contactos iniciado", {
        phoneNumberId: credentials.phoneNumberId,
      });
    } catch (error) {
      logWarn("embedded signup: sync de coexistence falló", {
        phoneNumberId: credentials.phoneNumberId,
        message: error.message,
        code: error.meta?.code || null,
      });
    }
  }

  logInfo("embedded signup: conexión guardada", {
    ownerUserId,
    integrationId: integration.id,
    wabaId: resolvedWabaId,
    phoneNumberId: credentials.phoneNumberId,
    coexistenceEnabled,
  });

  let followupTemplateError = null;
  try {
    await ensureFollowupDefault({ ownerUserId, wabaId: resolvedWabaId, accessToken });
  } catch (error) {
    followupTemplateError = followupTemplateFailureMessage(error);
    logWarn("embedded signup: no se pudo crear la plantilla de seguimiento", {
      ownerUserId,
      wabaId: resolvedWabaId,
      message: error.message,
    });
    try {
      await integration.update({ lastError: followupTemplateError });
    } catch (updateError) {
      logWarn("embedded signup: no se pudo guardar el aviso de plantilla", {
        message: updateError.message,
      });
    }
  }

  return {
    integration,
    displayPhoneNumber,
    coexistenceEnabled,
    provider: META_WHATSAPP_PROVIDER,
    followupTemplateError,
  };
}

function followupTemplateFailureMessage(error) {
  const detail = String(error?.message || "")
    .replace(/EAA[A-Za-z0-9]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const base = "No se pudo dejar lista la plantilla de seguimiento.";
  if (!detail) return base;
  if (detail.includes("plantilla de seguimiento")) return detail.slice(0, 300);
  return `${base} ${detail}`.slice(0, 300);
}

export async function disconnectMetaWhatsapp({ ownerUserId }) {
  const integration = await ChannelIntegration.findOne({
    where: {
      ownerUserId,
      channel: WHATSAPP_CHANNEL,
      provider: META_WHATSAPP_PROVIDER,
      status: { [Op.ne]: "eliminated" },
    },
  });
  if (!integration) throw new ApiError(404, "No hay una conexión de Meta para desconectar.");

  let token = "";
  try {
    const cred = await ChannelCredential.findOne({
      where: { ownerUserId, channelIntegrationId: integration.id, isActive: true },
    });
    if (cred) {
      token = String(decryptCredentialsPayload(cred.cipherText)?.accessToken || "").trim();
    }
  } catch {
    token = "";
  }

  const wabaId = integration.wabaId;
  if (token && wabaId) {
    try {
      await unsubscribeWabaApp(wabaId, token);
    } catch (error) {
      logWarn("disconnect: no se pudo desuscribir el WABA", {
        integrationId: integration.id,
        message: error.message,
      });
    }
  }

  await ChannelCredential.update(
    { isActive: false },
    { where: { ownerUserId, channelIntegrationId: integration.id } },
  );
  await integration.update({
    status: "disabled",
    lastError: null,
    coexistenceEnabled: false,
  });

  logInfo("disconnect: conexión Meta desactivada", { ownerUserId, integrationId: integration.id });
  return { ok: true, integrationId: integration.id };
}
