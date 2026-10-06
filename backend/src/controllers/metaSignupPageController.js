import { publicMetaSignupConfig } from "../services/metaSignupService.js";
import {
  SIGNUP_APP_SCHEME,
  SIGNUP_TICKET_TTL_MS,
  cancelMetaSignupTicket,
  completeMetaSignupTicket,
  previewSignupTicket,
} from "../services/metaSignupTicketService.js";

export const SIGNUP_TICKET_COOKIE = "meta_signup_ticket";

export function readSignupTicketCookie(header) {
  const raw = String(header || "");
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== SIGNUP_TICKET_COOKIE) continue;
    try {
      return decodeURIComponent(trimmed.slice(eq + 1)).trim();
    } catch {
      return "";
    }
  }
  return "";
}

function requestIsHttps(req) {
  if (req.secure === true) return true;
  const proto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  return proto === "https";
}

function ticketCookie(ticket, { secure = false, clear = false } = {}) {
  const parts = [
    `${SIGNUP_TICKET_COOKIE}=${clear ? "" : encodeURIComponent(ticket)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/whatsapp-signup",
    `Max-Age=${clear ? 0 : Math.floor(SIGNUP_TICKET_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export const SIGNUP_PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://www.facebook.com https://*.fbcdn.net",
  "frame-src https://www.facebook.com https://web.facebook.com https://business.facebook.com",
  "connect-src 'self' https://www.facebook.com https://web.facebook.com https://graph.facebook.com https://connect.facebook.net",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

const SIGNUP_CLIENT_SCRIPT = `
(function () {
  var config = JSON.parse(document.getElementById("signup-config").textContent);
  var statusEl = document.getElementById("status");
  var launchEl = document.getElementById("launch");
  var returnEl = document.getElementById("return-link");
  var session = null;
  var finished = false;

  window.addEventListener("message", function (event) {
    if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
    var data = event.data;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (err) { return; }
    }
    if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;
    var info = data.data && typeof data.data === "object" ? data.data : {};
    var asId = function (value) {
      return typeof value === "string" || typeof value === "number" ? String(value) : null;
    };
    session = {
      event: data.event ? String(data.event) : null,
      wabaId: asId(info.waba_id),
      phoneNumberId: asId(info.phone_number_id),
      businessId: asId(info.business_id),
    };
  });

  function returnToApp(result) {
    var allowed = result === "success" || result === "cancel" || result === "error" ? result : "error";
    var url = config.scheme + "://whatsapp-signup?result=" + allowed;
    returnEl.href = url;
    returnEl.hidden = false;
    window.location.href = url;
  }

  function waitForSession() {
    var start = Date.now();
    return new Promise(function (resolve) {
      var timer = setInterval(function () {
        if ((session && session.wabaId) || Date.now() - start >= 1000) {
          clearInterval(timer);
          resolve(session);
        }
      }, 50);
    });
  }

  function postJson(path, body) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        return { ok: response.ok, payload: payload };
      });
    });
  }

  function finish(response) {
    var code = response && response.authResponse ? String(response.authResponse.code || "").trim() : "";
    waitForSession().then(function (current) {
      if (finished) return;
      var eventName = current && current.event ? String(current.event) : "";
      if (eventName.toUpperCase() === "CANCEL") {
        finished = true;
        launchEl.disabled = true;
        statusEl.textContent = "Conexión cancelada.";
        return postJson("/whatsapp-signup/cancel", { ticket: config.ticket }).then(function () {
          returnToApp("cancel");
        });
      }
      if (!code) {
        launchEl.disabled = false;
        statusEl.textContent = "Termina en Facebook y pulsa Finalizar. Esta página volverá a la app sola.";
        return;
      }
      finished = true;
      launchEl.disabled = true;
      statusEl.textContent = "Conectando WhatsApp…";
      return postJson("/whatsapp-signup/complete", {
        ticket: config.ticket,
        code: code,
        wabaId: current && current.wabaId,
        phoneNumberId: current && current.phoneNumberId,
        businessId: current && current.businessId,
        event: eventName || null,
      }).then(function (result) {
        if (result.ok && result.payload && result.payload.status === "completed") {
          statusEl.textContent = "Listo. Volviendo a la app…";
          returnToApp("success");
          return;
        }
        if (result.payload && result.payload.status === "cancelled") {
          statusEl.textContent = "Conexión cancelada.";
          returnToApp("cancel");
          return;
        }
        statusEl.textContent = (result.payload && result.payload.message) || "No se pudo conectar WhatsApp.";
        returnToApp("error");
      });
    }).catch(function () {
      statusEl.textContent = "No se pudo conectar WhatsApp.";
      returnToApp("error");
    });
  }

  window.fbAsyncInit = function () {
    window.FB.init({
      appId: config.appId,
      cookie: true,
      xfbml: false,
      version: config.graphVersion,
      autoLogAppEvents: true,
    });
  };

  launchEl.addEventListener("click", function () {
    if (!window.FB) {
      statusEl.textContent = "El SDK de Facebook no está listo. Recarga la página.";
      return;
    }
    launchEl.disabled = true;
    window.FB.login(finish, {
      config_id: config.configId,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: config.featureType,
        sessionInfoVersion: config.sessionInfoVersion || "3",
      },
    });
  });
})();
`;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function applySignupDocumentHeaders(res) {
  res.setHeader("Content-Security-Policy", SIGNUP_PAGE_CSP);
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
}

function pageShell({ title, body }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font-family: Helvetica, Arial, sans-serif; background: #f4f6f8; color: #1c1e21; }
    main { max-width: 28rem; margin: 12vh auto; padding: 1.5rem; }
    h1 { font-size: 1.4rem; margin: 0 0 0.5rem; }
    p { line-height: 1.4; }
    button, a.return { display: inline-block; margin-top: 1rem; background: #1877f2; color: #fff; border: 0; border-radius: 4px; font-weight: 700; font-size: 16px; line-height: 40px; padding: 0 24px; text-decoration: none; }
    button:disabled { opacity: 0.6; }
  </style>
</head>
<body>
  <main>
    ${body}
  </main>
</body>
</html>`;
}

export function renderSignupResultHtml(result) {
  const allowed = result === "success" || result === "cancel" || result === "error" ? result : "error";
  const url = `${SIGNUP_APP_SCHEME}://whatsapp-signup?result=${allowed}`;
  const title =
    allowed === "success" ? "WhatsApp conectado" : allowed === "cancel" ? "Conexión cancelada" : "No se pudo conectar";
  const message =
    allowed === "success"
      ? "Listo. Volviendo a la app…"
      : allowed === "cancel"
        ? "Conexión cancelada."
        : "No se pudo conectar WhatsApp.";
  return pageShell({
    title,
    body: `<h1>${escapeHtml(title)}</h1>
    <p id="status">${escapeHtml(message)}</p>
    <a id="return-link" class="return" href="${url}">Volver a la app</a>
    <script>window.location.replace(${JSON.stringify(url)});</script>`,
  });
}

export function renderSignupErrorHtml(message) {
  return pageShell({
    title: "Conectar WhatsApp",
    body: `<h1>No se puede conectar</h1><p>${escapeHtml(message)}</p>`,
  });
}

export function renderSignupPageHtml({ ticket, config }) {
  const payload = JSON.stringify({
    ticket,
    appId: config.appId,
    configId: config.configId,
    graphVersion: config.graphVersion,
    featureType: config.featureType,
    sessionInfoVersion: config.sessionInfoVersion || "3",
    scheme: SIGNUP_APP_SCHEME,
  }).replace(/</g, "\\u003c");

  return pageShell({
    title: "Conectar WhatsApp",
    body: `<h1>Conectar WhatsApp</h1>
    <p id="status">Continúa con Facebook para vincular tu número de WhatsApp Business.</p>
    <button id="launch" type="button">Continuar con Facebook</button>
    <a id="return-link" class="return" hidden href="${SIGNUP_APP_SCHEME}://whatsapp-signup?result=error">Volver a la app</a>
    <script type="application/json" id="signup-config">${payload}</script>
    <script>${SIGNUP_CLIENT_SCRIPT}</script>
    <script async defer crossorigin="anonymous" src="https://connect.facebook.net/es_LA/sdk.js"></script>`,
  });
}

export async function getWhatsappSignupPage(req, res, next, deps = {}) {
  try {
    applySignupDocumentHeaders(res);
    const preview = deps.previewSignupTicket || previewSignupTicket;
    const loadConfig = deps.publicMetaSignupConfig || publicMetaSignupConfig;
    const complete = deps.completeMetaSignupTicket || completeMetaSignupTicket;
    const cancel = deps.cancelMetaSignupTicket || cancelMetaSignupTicket;
    const secure = requestIsHttps(req);
    const code = String(req.query?.code || "").trim();
    const oauthError = String(req.query?.error || "").trim();
    const queryTicket = String(req.query?.ticket || "").trim();
    const cookieTicket = readSignupTicketCookie(req.headers?.cookie);

    if (code || oauthError) {
      res.setHeader("Set-Cookie", ticketCookie("", { secure, clear: true }));
      if (!cookieTicket) {
        res.status(400).send(renderSignupErrorHtml("Este enlace de conexión no es válido o ya venció."));
        return;
      }
      if (!code) {
        await cancel(cookieTicket).catch(() => undefined);
        res.status(200).send(renderSignupResultHtml("cancel"));
        return;
      }
      try {
        const result = await complete({ ticket: cookieTicket, code });
        const kind = result?.status === "completed" ? "success" : result?.status === "cancelled" ? "cancel" : "error";
        res.status(200).send(renderSignupResultHtml(kind));
      } catch {
        res.status(200).send(renderSignupResultHtml("error"));
      }
      return;
    }

    const ticket = queryTicket || cookieTicket;
    const valid = ticket ? await preview(ticket) : null;
    if (!valid) {
      res.status(400).send(renderSignupErrorHtml("Este enlace de conexión no es válido o ya venció."));
      return;
    }
    const config = loadConfig();
    if (!config.configured) {
      res.status(503).send(renderSignupErrorHtml("Embedded Signup no está configurado en el servidor."));
      return;
    }
    if (queryTicket) {
      res.setHeader("Set-Cookie", ticketCookie(ticket, { secure }));
      res.status(302);
      res.setHeader("Location", "/whatsapp-signup");
      res.send("");
      return;
    }
    res.status(200).send(renderSignupPageHtml({ ticket, config }));
  } catch (err) {
    next(err);
  }
}

export async function postWhatsappSignupComplete(req, res, next, deps = {}) {
  try {
    const complete = deps.completeMetaSignupTicket || completeMetaSignupTicket;
    const result = await complete({
      ticket: req.body?.ticket,
      code: req.body?.code,
      wabaId: req.body?.wabaId || req.body?.waba_id,
      phoneNumberId: req.body?.phoneNumberId || req.body?.phone_number_id,
      businessId: req.body?.businessId || req.body?.business_id,
      event: req.body?.event,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function postWhatsappSignupCancel(req, res, next, deps = {}) {
  try {
    const cancel = deps.cancelMetaSignupTicket || cancelMetaSignupTicket;
    const result = await cancel(req.body?.ticket);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
