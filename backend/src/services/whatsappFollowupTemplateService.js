import { env } from "../config/env.js";
import { BotSetting, ChannelIntegration, WhatsappMessageTemplate } from "../models/index.js";
import { ApiError } from "../utils/errors.js";
import {
  META_FOLLOWUP_DEFAULT_BODY,
  META_FOLLOWUP_DISPLAY_NAME,
  TEMPLATE_CATEGORY,
  TEMPLATE_LANGUAGE,
  TEMPLATE_PURPOSE_FOLLOWUP,
  assertTextOnlyTemplateBody,
  bodyTextFromComponents,
  buildTextOnlyBodyComponents,
  generateFollowupTemplateName,
  isFollowupTemplateName,
} from "../utils/whatsappTemplateBody.js";
import {
  META_WHATSAPP_PROVIDER,
  WHATSAPP_CHANNEL,
  resolveMetaWhatsappIntegrationById,
} from "./integrationResolverService.js";
import {
  createMessageTemplate,
  getMessageTemplate,
  listMessageTemplates,
  updateMessageTemplate,
} from "./metaGraphClient.js";

const quietTest = process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);

function logWarn(message, fields) {
  if (quietTest) return;
  console.warn(`[wa-template] ${message}`, fields ?? "");
}

const TEMPLATE_STATUS_EVENTS = new Set(["PENDING", "APPROVED", "REJECTED", "PAUSED", "DISABLED"]);

export function mapTemplateStatusEvent(event) {
  const normalized = String(event || "").trim().toUpperCase();
  if (normalized === "FLAGGED") return "PAUSED";
  return TEMPLATE_STATUS_EVENTS.has(normalized) ? normalized : null;
}

export function isDuplicateNameError(error) {
  const details = [error?.message, error?.code, error?.meta?.message, error?.meta?.code]
    .filter(Boolean)
    .join(" ");
  return /duplicate|already\s+exists|unique|name\s+collision/i.test(details);
}

export function isFollowupTemplateApproved(row) {
  return String(row?.status || "").toUpperCase() === "APPROVED";
}

export function serializeFollowupTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    body: bodyTextFromComponents(row.components),
    status: row.status,
    rejectedReason: row.rejectedReason ?? null,
    language: row.language,
    category: row.category,
    lastStatusAt: row.lastStatusAt ?? null,
  };
}

function isRejected(row) {
  return String(row?.status || "").toUpperCase() === "REJECTED";
}

function templateLanguage() {
  return env.meta.templateLanguage || TEMPLATE_LANGUAGE;
}

function resolveFollowupBody(body) {
  if (body == null || String(body).trim() === "") return META_FOLLOWUP_DEFAULT_BODY;
  return assertTextOnlyTemplateBody(body);
}

async function defaultFindActiveIntegration(ownerUserId) {
  return ChannelIntegration.findOne({
    where: {
      ownerUserId,
      channel: WHATSAPP_CHANNEL,
      provider: META_WHATSAPP_PROVIDER,
      status: "active",
    },
    order: [["updatedAt", "DESC"]],
  });
}

async function findFollowupRows({ ownerUserId, wabaId }) {
  return WhatsappMessageTemplate.findAll({
    where: { ownerUserId, wabaId, purpose: TEMPLATE_PURPOSE_FOLLOWUP },
    order: [["createdAt", "DESC"]],
  });
}

async function findActiveFollowup({ ownerUserId, wabaId }) {
  const rows = await findFollowupRows({ ownerUserId, wabaId });
  return rows.find((row) => !isRejected(row)) || null;
}

function pickFollowupRow(rows) {
  return rows.find((row) => !isRejected(row)) || rows[0] || null;
}

async function syncReminderMessage(ownerUserId, body) {
  const row = await BotSetting.findOne({ where: { ownerUserId } });
  if (!row) return;
  await row.update({ reminderMessage: body });
}

async function createTemplateOnMeta({ wabaId, token, body, createOnMeta }) {
  const language = templateLanguage();
  const category = TEMPLATE_CATEGORY;
  const components = buildTextOnlyBodyComponents(body);
  let name = generateFollowupTemplateName();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const payload = { name, language, category, components };
    try {
      const result = await createOnMeta({ wabaId, token, payload });
      return {
        metaTemplateId: result?.id,
        name,
        language,
        category,
        components,
      };
    } catch (error) {
      if (attempt === 1 || !isDuplicateNameError(error)) throw error;
      name = generateFollowupTemplateName();
    }
  }
  throw new Error("No se pudo crear la plantilla.");
}

async function persistFollowupTemplate({
  ownerUserId,
  wabaId,
  meta,
  isWabaDefault,
}) {
  return WhatsappMessageTemplate.create({
    ownerUserId,
    wabaId,
    metaTemplateId: meta.metaTemplateId,
    name: meta.name,
    displayName: META_FOLLOWUP_DISPLAY_NAME,
    language: meta.language,
    category: meta.category,
    components: meta.components,
    status: "PENDING",
    rejectedReason: null,
    lastStatusAt: new Date(),
    purpose: TEMPLATE_PURPOSE_FOLLOWUP,
    isWabaDefault,
  });
}

async function requireMetaCredentials({
  ownerUserId,
  findActiveIntegration,
  resolveIntegration,
}) {
  const integration = await findActiveIntegration(ownerUserId);
  if (!integration) {
    throw new ApiError(400, "Conecta WhatsApp con Meta para gestionar la plantilla de seguimiento.");
  }
  const resolved = await resolveIntegration({ ownerUserId, integrationId: integration.id });
  const credentials = resolved?.credentials || {};
  const wabaId = String(credentials.wabaId || integration.wabaId || "").trim();
  const accessToken = String(credentials.accessToken || "").trim();
  if (!wabaId || !accessToken) {
    throw new ApiError(400, "Conecta WhatsApp con Meta para gestionar la plantilla de seguimiento.");
  }
  return { integration, credentials, wabaId, accessToken };
}

export async function applyTemplateStatusUpdate(update = {}) {
  const status = mapTemplateStatusEvent(update.event);
  if (!status) {
    return { processed: true, reason: "unknown_event" };
  }

  const metaTemplateId = String(update.metaTemplateId || "").trim();
  const where = metaTemplateId
    ? { metaTemplateId }
    : {
        wabaId: String(update.wabaId || "").trim(),
        name: String(update.name || "").trim(),
      };
  const template = await WhatsappMessageTemplate.findOne({ where });
  if (!template) {
    return { processed: true, reason: "unknown_template" };
  }

  await template.update({
    status,
    rejectedReason: status === "REJECTED" ? update.reason || null : null,
    lastStatusAt: new Date(),
  });
  return {
    processed: true,
    reason: "template_status_updated",
    templateId: template.id,
    status,
  };
}

const REMOTE_STATUS_RANK = { APPROVED: 0, PENDING: 1, PAUSED: 2, DISABLED: 3 };

function componentsFromRemote(remote) {
  const list = Array.isArray(remote?.components) ? remote.components : [];
  const text = bodyTextFromComponents(list);
  if (!text) return buildTextOnlyBodyComponents(META_FOLLOWUP_DEFAULT_BODY);
  try {
    return buildTextOnlyBodyComponents(text);
  } catch {
    return list;
  }
}

function pickRemoteFollowup(templates) {
  const language = templateLanguage();
  const matches = (Array.isArray(templates) ? templates : []).filter((row) => {
    if (!isFollowupTemplateName(row?.name)) return false;
    const status = mapTemplateStatusEvent(row?.status);
    if (!status || status === "REJECTED") return false;
    const lang = String(row?.language || "").trim();
    return !lang || lang === language;
  });
  matches.sort(
    (a, b) =>
      (REMOTE_STATUS_RANK[mapTemplateStatusEvent(a.status)] ?? 9) -
      (REMOTE_STATUS_RANK[mapTemplateStatusEvent(b.status)] ?? 9),
  );
  return matches[0] || null;
}

async function upsertFollowupFromRemote({ ownerUserId, wabaId, remote, localRows }) {
  const status = mapTemplateStatusEvent(remote.status) || "PENDING";
  const patch = {
    ownerUserId,
    metaTemplateId: String(remote.id || "").trim() || null,
    name: String(remote.name || "").trim(),
    displayName: META_FOLLOWUP_DISPLAY_NAME,
    language: String(remote.language || templateLanguage()).trim() || templateLanguage(),
    category: String(remote.category || TEMPLATE_CATEGORY).trim() || TEMPLATE_CATEGORY,
    components: componentsFromRemote(remote),
    status,
    rejectedReason: status === "REJECTED" ? remote.rejected_reason || null : null,
    lastStatusAt: new Date(),
    purpose: TEMPLATE_PURPOSE_FOLLOWUP,
    isWabaDefault: true,
  };
  const existing =
    localRows.find((row) => row.name === patch.name) ||
    (await WhatsappMessageTemplate.findOne({ where: { wabaId, name: patch.name } }));
  if (existing) {
    await existing.update(patch);
    return existing;
  }
  return WhatsappMessageTemplate.create({ wabaId, ...patch });
}

async function syncPendingTemplateFromGraph(row, { accessToken, getTemplateOnMeta }) {
  if (String(row?.status || "").toUpperCase() !== "PENDING") return row;
  const templateId = String(row?.metaTemplateId || "").trim();
  if (!templateId || !accessToken) return row;
  try {
    const remote = await getTemplateOnMeta({ templateId, token: accessToken });
    const status = mapTemplateStatusEvent(remote?.status);
    if (!status || status === "PENDING") return row;
    await row.update({
      status,
      rejectedReason: status === "REJECTED" ? remote.rejected_reason || null : null,
      lastStatusAt: new Date(),
    });
  } catch (error) {
    logWarn("No se pudo consultar el estado de la plantilla", {
      templateId,
      message: error.message,
    });
  }
  return row;
}

export async function getFollowupTemplate({
  ownerUserId,
  findActiveIntegration = defaultFindActiveIntegration,
  resolveIntegration = resolveMetaWhatsappIntegrationById,
  getTemplateOnMeta = getMessageTemplate,
} = {}) {
  const integration = await findActiveIntegration(ownerUserId);
  if (!integration) return { metaConnected: false, template: null };
  const wabaId = String(integration.wabaId || "").trim();
  const rows = await findFollowupRows({ ownerUserId, wabaId });
  const row = pickFollowupRow(rows);
  if (row && String(row.status || "").toUpperCase() === "PENDING" && row.metaTemplateId) {
    try {
      const resolved = await resolveIntegration({ ownerUserId, integrationId: integration.id });
      const accessToken = String(resolved?.credentials?.accessToken || "").trim();
      await syncPendingTemplateFromGraph(row, { accessToken, getTemplateOnMeta });
    } catch (error) {
      logWarn("No se pudo leer el token para consultar la plantilla", { message: error.message });
    }
  }
  return { metaConnected: true, template: serializeFollowupTemplate(row) };
}

export async function ensureFollowupDefaultTemplate({
  ownerUserId,
  wabaId,
  accessToken,
  createOnMeta = createMessageTemplate,
  listOnMeta = listMessageTemplates,
} = {}) {
  const localRows = await findFollowupRows({ ownerUserId, wabaId });
  let remoteTemplates;
  try {
    remoteTemplates = await listOnMeta({ wabaId, token: accessToken });
  } catch (error) {
    const local = localRows.find((row) => !isRejected(row) && row.metaTemplateId);
    if (local) return { created: false, template: local };
    throw error;
  }

  const remote = pickRemoteFollowup(remoteTemplates);
  if (remote) {
    const template = await upsertFollowupFromRemote({ ownerUserId, wabaId, remote, localRows });
    const body = bodyTextFromComponents(template.components);
    if (body) await syncReminderMessage(ownerUserId, body);
    return { created: false, reused: true, template };
  }

  const local = localRows.find((row) => !isRejected(row) && row.metaTemplateId);
  if (local) {
    const match = remoteTemplates.find((row) => String(row.id) === String(local.metaTemplateId));
    const matchStatus = match ? mapTemplateStatusEvent(match.status) : null;
    if (match && matchStatus && matchStatus !== "REJECTED") {
      const template = await upsertFollowupFromRemote({
        ownerUserId,
        wabaId,
        remote: match,
        localRows,
      });
      return { created: false, reused: true, template };
    }
    if (!match) return { created: false, template: local };
  }

  const body = META_FOLLOWUP_DEFAULT_BODY;
  const meta = await createTemplateOnMeta({
    wabaId,
    token: accessToken,
    body,
    createOnMeta,
  });
  const template = await persistFollowupTemplate({
    ownerUserId,
    wabaId,
    meta,
    isWabaDefault: true,
  });
  await syncReminderMessage(ownerUserId, body);
  return { created: true, template };
}

export async function createFollowupTemplate({
  ownerUserId,
  body,
  createOnMeta = createMessageTemplate,
  findActiveIntegration = defaultFindActiveIntegration,
  resolveIntegration = resolveMetaWhatsappIntegrationById,
} = {}) {
  const { wabaId, accessToken } = await requireMetaCredentials({
    ownerUserId,
    findActiveIntegration,
    resolveIntegration,
  });
  const existing = await findActiveFollowup({ ownerUserId, wabaId });
  if (existing) {
    throw new ApiError(409, "Ya existe una plantilla de seguimiento activa.");
  }

  const text = resolveFollowupBody(body);
  const meta = await createTemplateOnMeta({
    wabaId,
    token: accessToken,
    body: text,
    createOnMeta,
  });
  const template = await persistFollowupTemplate({
    ownerUserId,
    wabaId,
    meta,
    isWabaDefault: false,
  });
  await syncReminderMessage(ownerUserId, text);
  return serializeFollowupTemplate(template);
}

export async function updateFollowupTemplate({
  ownerUserId,
  body,
  updateOnMeta = updateMessageTemplate,
  findActiveIntegration = defaultFindActiveIntegration,
  resolveIntegration = resolveMetaWhatsappIntegrationById,
} = {}) {
  const { wabaId, accessToken } = await requireMetaCredentials({
    ownerUserId,
    findActiveIntegration,
    resolveIntegration,
  });
  const rows = await findFollowupRows({ ownerUserId, wabaId });
  const row = pickFollowupRow(rows);
  if (!row) {
    throw new ApiError(404, "No se encontró la plantilla de seguimiento.");
  }
  if (String(row.status || "").toUpperCase() === "PENDING") {
    throw new ApiError(409, "No se puede editar una plantilla en revisión");
  }

  const text = assertTextOnlyTemplateBody(body);
  const language = templateLanguage();
  const category = TEMPLATE_CATEGORY;
  const components = buildTextOnlyBodyComponents(text);
  await updateOnMeta({
    templateId: row.metaTemplateId,
    token: accessToken,
    payload: { components, language, category },
  });
  await row.update({
    components,
    status: "PENDING",
    rejectedReason: null,
    lastStatusAt: new Date(),
  });
  await syncReminderMessage(ownerUserId, text);
  return serializeFollowupTemplate(row);
}
