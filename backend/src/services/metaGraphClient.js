import { env } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import { parseGraphErrorPayload, toMetaErrorMeta, userFacingMetaCodeMessage } from "../utils/metaError.js";

const quietTest = process.env.NODE_ENV === "test" || Boolean(process.env.NODE_TEST_CONTEXT);

function logInfo(message, fields) {
  if (quietTest) return;
  console.info(`[meta-graph] ${message}`, fields ?? "");
}

function logWarn(message, fields) {
  if (quietTest) return;
  console.warn(`[meta-graph] ${message}`, fields ?? "");
}

function logError(message, fields) {
  if (quietTest) return;
  console.error(`[meta-graph] ${message}`, fields ?? "");
}

function graphBase() {
  const version = String(env.meta.graphApiVersion || "v21.0").replace(/^\/+|\/+$/g, "");
  return `https://graph.facebook.com/${version}`;
}

export function attachMetaError(err, details = {}) {
  err.meta = toMetaErrorMeta(details, {
    httpStatus: err.status,
    message: err.message,
  });
  return err;
}

export function graphErrorFromResponse(httpStatus, payload) {
  const details = parseGraphErrorPayload(payload, httpStatus);
  const err = new ApiError(
    httpStatus >= 400 && httpStatus < 600 ? httpStatus : 502,
    userFacingMetaCodeMessage(details.code, details.message),
  );
  return attachMetaError(err, details);
}

async function parseResponse(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text.slice(0, 300) } };
  }
}

export function describeGraphToken(token) {
  const value = String(token || "").trim();
  const platform = String(env.meta.accessToken || "").trim();
  if (!value) return { source: "missing", preview: null };
  const source = platform && value === platform ? "META_ACCESS_TOKEN" : "plannerAccessToken";
  return {
    source,
    preview: `${value.slice(0, 8)}…len=${value.length}`,
    equalsPlatform: Boolean(platform && value === platform),
  };
}

export async function graphRequest({
  method = "GET",
  path,
  token,
  query = {},
  body,
  timeoutMs = env.meta.timeoutMs || 8000,
  errorLog = "error",
} = {}) {
  const url = new URL(`${graphBase()}/${String(path || "").replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null) headers["Content-Type"] = "application/json";

  const described = describeGraphToken(token);
  if (env.meta.debugGraphToken && !quietTest) {
    console.log(`[meta-graph] Authorization Bearer source=${described.source} preview=${described.preview}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const err = new ApiError(502, "No se pudo contactar la API de Meta.");
    attachMetaError(err, { httpStatus: 502, message: error.message });
    logError("Graph API red falló", { path, method, message: error.message });
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const payload = await parseResponse(res);
  if (!res.ok) {
    const err = graphErrorFromResponse(res.status, payload);
    const graphErrorMeta = {
      path,
      method,
      ...toMetaErrorMeta(err.meta, { httpStatus: res.status, message: err.message }),
    };
    if (errorLog === "warn") logWarn("Graph API error", graphErrorMeta);
    else logError("Graph API error", graphErrorMeta);
    throw err;
  }
  return payload;
}

function isBenignWabaLinkError(error) {
  const code = Number(error?.meta?.code);
  const subcode = Number(error?.meta?.subcode);
  if (code === 100 && subcode === 33) return false;
  const details = [error?.message, error?.meta?.message].filter(Boolean).join(" ");
  if (/\bdoes not exist\b|nonexist/i.test(details)) return false;
  return /\balready\b|\bduplicate\b|\blinked\b|\bshared\b/i.test(details);
}

export async function shareClientWhatsappBusinessAccount({ wabaId, businessId, token } = {}) {
  const id = String(businessId || env.meta.businessId || "").trim();
  const waba = String(wabaId || "").trim();
  const access = String(token || env.meta.accessToken || "").trim();
  if (!id) throw new ApiError(500, "Falta META_BUSINESS_ID para vincular el WABA al portafolio.");
  if (!waba) throw new ApiError(400, "Falta el WABA ID.");
  if (!access) throw new ApiError(400, "Falta META_ACCESS_TOKEN.");
  return graphRequest({
    method: "POST",
    path: `${id}/client_whatsapp_business_accounts`,
    token: access,
    query: { waba_id: waba },
    errorLog: "warn",
  });
}

export async function assignSystemUserToWaba({ wabaId, systemUserId, token } = {}) {
  const waba = String(wabaId || "").trim();
  const user = String(systemUserId || env.meta.systemUserId || "").trim();
  const access = String(token || "").trim();
  if (!waba) throw new ApiError(400, "Falta el WABA ID.");
  if (!user) throw new ApiError(400, "Falta el system user ID.");
  if (!access) throw new ApiError(400, "Falta el token para asignar el system user.");
  return graphRequest({
    method: "POST",
    path: `${waba}/assigned_users`,
    token: access,
    query: {
      user,
      tasks: JSON.stringify(["MANAGE"]),
    },
    errorLog: "warn",
  });
}

export async function ensurePlatformCanManageWaba({ wabaId, plannerAccessToken } = {}) {
  const platformToken = String(env.meta.accessToken || "").trim();
  if (!platformToken) {
    return { skipped: true, reason: "no_platform_token", shared: false, assigned: false };
  }
  const waba = String(wabaId || "").trim();
  if (!waba) {
    return { skipped: true, reason: "no_waba", shared: false, assigned: false };
  }

  const businessId = String(env.meta.businessId || "").trim();
  const shareToken = String(plannerAccessToken || platformToken).trim();
  let shared = false;
  if (businessId) {
    try {
      await shareClientWhatsappBusinessAccount({ wabaId: waba, businessId, token: shareToken });
      shared = true;
      logInfo("OBO: WABA vinculado al portafolio", { wabaId: waba, businessId });
    } catch (error) {
      if (isBenignWabaLinkError(error)) {
        shared = true;
        logInfo("OBO: WABA ya estaba vinculado", { wabaId: waba, businessId });
      } else {
        logWarn("OBO: no se pudo vincular el WABA al portafolio", {
          wabaId: waba,
          businessId,
          ...toMetaErrorMeta(error.meta, { message: error.message }),
        });
      }
    }
  } else {
    logWarn("OBO: falta META_BUSINESS_ID; no se puede POST client_whatsapp_business_accounts", {
      wabaId: waba,
    });
  }

  let assigned = false;
  try {
    let systemUserId = String(env.meta.systemUserId || "").trim();
    if (!systemUserId) {
      const me = await graphRequest({
        method: "GET",
        path: "me",
        token: platformToken,
        query: { fields: "id" },
      });
      systemUserId = String(me.id || "").trim();
    }
    if (systemUserId) {
      const assignToken = String(plannerAccessToken || "").trim() || platformToken;
      await assignSystemUserToWaba({ wabaId: waba, systemUserId, token: assignToken });
      assigned = true;
      logInfo("OBO: system user asignado al WABA", { wabaId: waba, systemUserId });
    }
  } catch (error) {
    if (isBenignWabaLinkError(error)) {
      assigned = true;
      logInfo("OBO: system user ya tenía acceso al WABA", { wabaId: waba });
    } else {
      logWarn("OBO: no se pudo asignar el system user", {
        wabaId: waba,
        ...toMetaErrorMeta(error.meta, { message: error.message }),
      });
    }
  }

  if (!shared && !assigned) {
    logWarn("OBO: el token de plataforma no tiene acceso a este WABA; se usará el token del planner", {
      wabaId: waba,
    });
  }
  return { skipped: false, shared, assigned };
}

export async function exchangeEmbeddedSignupCode(code) {
  const appId = String(env.meta.appId || "").trim();
  const appSecret = String(env.meta.appSecret || "").trim();
  if (!appId || !appSecret) {
    throw new ApiError(500, "Faltan META_APP_ID o META_APP_SECRET en el servidor.");
  }
  const payload = await graphRequest({
    method: "GET",
    path: "oauth/access_token",
    query: {
      client_id: appId,
      client_secret: appSecret,
      code: String(code || "").trim(),
    },
  });
  const accessToken = String(payload.access_token || "").trim();
  if (!accessToken) throw new ApiError(502, "Meta no devolvió un access token intercambiable.");
  return {
    accessToken,
    tokenType: payload.token_type || null,
    expiresIn: payload.expires_in ?? null,
  };
}

export async function subscribeWabaApp(wabaId, token) {
  return graphRequest({
    method: "POST",
    path: `${wabaId}/subscribed_apps`,
    token,
  });
}

export async function unsubscribeWabaApp(wabaId, token) {
  return graphRequest({
    method: "DELETE",
    path: `${wabaId}/subscribed_apps`,
    token,
  });
}

export async function listWabaPhoneNumbers(wabaId, token) {
  const payload = await graphRequest({
    method: "GET",
    path: `${wabaId}/phone_numbers`,
    token,
    query: {
      fields: "id,display_phone_number,verified_name,quality_rating,is_on_biz_app,platform_type",
    },
  });
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function getPhoneNumberDetails(phoneNumberId, token) {
  return graphRequest({
    method: "GET",
    path: phoneNumberId,
    token,
    query: {
      fields: "id,display_phone_number,verified_name,quality_rating,is_on_biz_app,platform_type",
    },
  });
}
