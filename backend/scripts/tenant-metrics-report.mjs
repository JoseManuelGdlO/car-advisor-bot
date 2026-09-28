#!/usr/bin/env node
/**
 * Genera reporte Markdown (+ PDF) de métricas del bot para un tenant.
 *
 * Uso:
 *   node scripts/tenant-metrics-report.mjs
 *   node scripts/tenant-metrics-report.mjs --tenant <uuid>
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const BACKEND = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(BACKEND, ".env") });

const DEFAULT_TENANT = "bab219f0-9e32-4416-a4f5-a9790bbc1499";
const args = process.argv.slice(2);
const tenantFlag = args.indexOf("--tenant");
const TENANT =
  tenantFlag >= 0 && args[tenantFlag + 1] ? args[tenantFlag + 1] : DEFAULT_TENANT;

const TZ_FALLBACK = "America/Monterrey";
const BOT_ROLES = new Set(["assistant", "bot"]);
const RESPONSE_MAX_MS = 30 * 60 * 1000; // >30 min no cuenta como respuesta al turno

const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lun→Dom

function fmtNum(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("es-MX", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${fmtNum(n * 100, digits)}%`;
}

function fmtDurationMs(ms) {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${fmtNum(s, 1)} s`;
  const m = s / 60;
  if (m < 60) return `${fmtNum(m, 1)} min`;
  return `${fmtNum(m / 60, 1)} h`;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (1 - (idx - lo)) + sorted[hi] * (idx - lo);
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
  return percentile([...arr].sort((a, b) => a - b), 0.5);
}

/** Parts of a Date in a given IANA timezone. */
function zonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map = {};
  for (const { type, value } of dtf.formatToParts(date)) {
    if (type !== "literal") map[type] = value;
  }
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: Number(map.hour),
    weekday: weekdayMap[map.weekday] ?? 0,
    dateKey: `${map.year}-${map.month}-${map.day}`,
  };
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function barChartSvg({
  title,
  labels,
  values,
  xLabel,
  yLabel,
  width = 900,
  height = 420,
  color = "#2563eb",
}) {
  const margin = { top: 48, right: 24, bottom: 72, left: 64 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const maxV = Math.max(...values, 1);
  const n = labels.length || 1;
  const gap = 0.25;
  const barW = plotW / n;
  const innerW = barW * (1 - gap);

  let bars = "";
  labels.forEach((label, i) => {
    const v = values[i] ?? 0;
    const h = (v / maxV) * plotH;
    const x = margin.left + i * barW + (barW - innerW) / 2;
    const y = margin.top + plotH - h;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${innerW.toFixed(1)}" height="${Math.max(h, 0).toFixed(1)}" fill="${color}"/>`;
    if (v > 0) {
      bars += `<text x="${(x + innerW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="11" fill="#334155">${escapeXml(String(v))}</text>`;
    }
    const rot = labels.length > 14;
    if (rot) {
      bars += `<text x="${(x + innerW / 2).toFixed(1)}" y="${(margin.top + plotH + 14).toFixed(1)}" text-anchor="end" font-size="10" fill="#475569" transform="rotate(-45 ${(x + innerW / 2).toFixed(1)} ${(margin.top + plotH + 14).toFixed(1)})">${escapeXml(label)}</text>`;
    } else {
      bars += `<text x="${(x + innerW / 2).toFixed(1)}" y="${(margin.top + plotH + 18).toFixed(1)}" text-anchor="middle" font-size="11" fill="#475569">${escapeXml(label)}</text>`;
    }
  });

  const ticks = 5;
  let grid = "";
  for (let t = 0; t <= ticks; t++) {
    const y = margin.top + (plotH * t) / ticks;
    const val = Math.round(maxV * (1 - t / ticks));
    grid += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#e2e8f0"/>`;
    grid += `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#64748b">${val}</text>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${width / 2}" y="28" text-anchor="middle" font-size="16" font-family="Helvetica, Arial, sans-serif" fill="#0f172a" font-weight="600">${escapeXml(title)}</text>
  ${grid}
  <g font-family="Helvetica, Arial, sans-serif">${bars}</g>
  <text x="${width / 2}" y="${height - 12}" text-anchor="middle" font-size="12" fill="#334155" font-family="Helvetica, Arial, sans-serif">${escapeXml(xLabel)}</text>
  <text x="16" y="${height / 2}" text-anchor="middle" font-size="12" fill="#334155" font-family="Helvetica, Arial, sans-serif" transform="rotate(-90 16 ${height / 2})">${escapeXml(yLabel)}</text>
</svg>`;
}

function lineChartSvg({
  title,
  labels,
  values,
  xLabel,
  yLabel,
  width = 960,
  height = 420,
  color = "#0d9488",
}) {
  const margin = { top: 48, right: 24, bottom: 72, left: 64 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const maxV = Math.max(...values, 1);
  const n = Math.max(values.length - 1, 1);

  const pts = values.map((v, i) => {
    const x = margin.left + (i / n) * plotW;
    const y = margin.top + plotH - (v / maxV) * plotH;
    return [x, y];
  });

  const poly = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  let grid = "";
  for (let t = 0; t <= 5; t++) {
    const y = margin.top + (plotH * t) / 5;
    const val = Math.round(maxV * (1 - t / 5));
    grid += `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#e2e8f0"/>`;
    grid += `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#64748b">${val}</text>`;
  }

  const step = Math.max(1, Math.ceil(labels.length / 10));
  let xLabels = "";
  labels.forEach((label, i) => {
    if (i % step !== 0 && i !== labels.length - 1) return;
    const x = margin.left + (i / n) * plotW;
    xLabels += `<text x="${x.toFixed(1)}" y="${margin.top + plotH + 18}" text-anchor="end" font-size="10" fill="#475569" transform="rotate(-40 ${x.toFixed(1)} ${margin.top + plotH + 18})">${escapeXml(label)}</text>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${width / 2}" y="28" text-anchor="middle" font-size="16" font-family="Helvetica, Arial, sans-serif" fill="#0f172a" font-weight="600">${escapeXml(title)}</text>
  ${grid}
  <polyline fill="none" stroke="${color}" stroke-width="2.5" points="${poly}"/>
  ${pts
    .map(
      ([x, y]) =>
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}"/>`
    )
    .join("")}
  <g font-family="Helvetica, Arial, sans-serif">${xLabels}</g>
  <text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-size="12" fill="#334155" font-family="Helvetica, Arial, sans-serif">${escapeXml(xLabel)}</text>
  <text x="16" y="${height / 2}" text-anchor="middle" font-size="12" fill="#334155" font-family="Helvetica, Arial, sans-serif" transform="rotate(-90 16 ${height / 2})">${escapeXml(yLabel)}</text>
</svg>`;
}

function histogramSvg({
  title,
  edges,
  counts,
  xLabel,
  yLabel,
  width = 900,
  height = 420,
  color = "#7c3aed",
}) {
  const labels = edges.slice(0, -1).map((e, i) => {
    const a = edges[i];
    const b = edges[i + 1];
    const fmt = (x) => (x >= 60 ? `${Math.round(x / 60)}m` : `${Math.round(x)}s`);
    return `${fmt(a)}–${fmt(b)}`;
  });
  return barChartSvg({
    title,
    labels,
    values: counts,
    xLabel,
    yLabel,
    width,
    height,
    color,
  });
}

async function queryAll(conn, tenant) {
  const q = async (sql, params = [tenant]) => {
    const [rows] = await conn.query(sql, params);
    return rows;
  };

  const overview = (
    await q(`
    SELECT
      (SELECT COUNT(*) FROM messages WHERE owner_user_id=?) AS messages,
      (SELECT COUNT(*) FROM conversations WHERE owner_user_id=?) AS conversations,
      (SELECT COUNT(*) FROM client_leads WHERE owner_user_id=?) AS leads,
      (SELECT COUNT(*) FROM owner_notifications WHERE owner_user_id=?) AS notifications,
      (SELECT COUNT(*) FROM channel_event_receipts WHERE owner_user_id=?) AS receipts,
      (SELECT MIN(created_at) FROM messages WHERE owner_user_id=?) AS min_msg,
      (SELECT MAX(created_at) FROM messages WHERE owner_user_id=?) AS max_msg,
      (SELECT timezone FROM bot_settings WHERE owner_user_id=? LIMIT 1) AS tz,
      (SELECT name FROM users WHERE id=? LIMIT 1) AS owner_name,
      (SELECT email FROM users WHERE id=? LIMIT 1) AS owner_email
  `, Array(10).fill(tenant))
  )[0];

  const messagesByFrom = await q(
    `SELECT \`from\` AS role, COUNT(*) AS c FROM messages WHERE owner_user_id=? GROUP BY \`from\` ORDER BY c DESC`
  );

  const messagesByPlatform = await q(
    `SELECT COALESCE(platform,'(sin plataforma)') AS platform, COUNT(*) AS c
     FROM messages WHERE owner_user_id=? GROUP BY platform ORDER BY c DESC`
  );

  const conversationsByChannel = await q(
    `SELECT channel, COUNT(*) AS c FROM conversations WHERE owner_user_id=? GROUP BY channel ORDER BY c DESC`
  );

  const handoff = (
    await q(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_human_controlled = 1 THEN 1 ELSE 0 END) AS handed_off,
      SUM(CASE WHEN last_reminder_at IS NOT NULL THEN 1 ELSE 0 END) AS with_reminder,
      AVG(CASE WHEN handoff_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, created_at, handoff_at) END) AS avg_handoff_sec,
      AVG(CASE WHEN last_time IS NOT NULL THEN TIMESTAMPDIFF(SECOND, created_at, last_time) END) AS avg_duration_sec
    FROM conversations WHERE owner_user_id=?
  `)
  )[0];

  const leadsByStatus = await q(
    `SELECT status, COUNT(*) AS c FROM client_leads WHERE owner_user_id=? GROUP BY status ORDER BY c DESC`
  );

  const leadsByContact = await q(
    `SELECT COALESCE(contact_method,'(sin definir)') AS contact_method, COUNT(*) AS c
     FROM client_leads WHERE owner_user_id=? GROUP BY contact_method ORDER BY c DESC`
  );

  const topInterest = await q(`
    SELECT
      COALESCE(NULLIF(TRIM(cl.interested_in), ''), CONCAT(v.brand, ' ', v.model), '(sin interés)') AS interest,
      COUNT(*) AS c
    FROM client_leads cl
    LEFT JOIN vehicles v ON v.id = cl.interested_vehicle_id
    WHERE cl.owner_user_id=?
    GROUP BY interest
    ORDER BY c DESC
    LIMIT 12
  `);

  const notificationsByKind = await q(
    `SELECT kind, COUNT(*) AS c FROM owner_notifications WHERE owner_user_id=? GROUP BY kind ORDER BY c DESC`
  );

  const receiptsByStatus = await q(
    `SELECT status, COUNT(*) AS c FROM channel_event_receipts WHERE owner_user_id=? GROUP BY status ORDER BY c DESC`
  );

  const msgsPerConv = await q(`
    SELECT conversation_id, COUNT(*) AS c
    FROM messages WHERE owner_user_id=?
    GROUP BY conversation_id
  `);

  const convDurations = await q(`
    SELECT
      conversation_id,
      TIMESTAMPDIFF(SECOND, MIN(created_at), MAX(created_at)) AS duration_sec,
      COUNT(*) AS msg_count
    FROM messages
    WHERE owner_user_id=?
    GROUP BY conversation_id
  `);

  const recentActivity = (
    await q(`
    SELECT
      SUM(CASE WHEN last_time >= NOW() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS active_7d,
      SUM(CASE WHEN last_time >= NOW() - INTERVAL 30 DAY THEN 1 ELSE 0 END) AS active_30d,
      SUM(CASE WHEN last_time < NOW() - INTERVAL 30 DAY OR last_time IS NULL THEN 1 ELSE 0 END) AS inactive_30d
    FROM conversations WHERE owner_user_id=?
  `)
  )[0];

  // Raw messages for temporal + latency (client/assistant focus)
  const rawMessages = await q(`
    SELECT id, conversation_id, \`from\` AS role, created_at
    FROM messages
    WHERE owner_user_id=?
    ORDER BY conversation_id, created_at ASC, id ASC
  `);

  const clientDaily = await q(`
    SELECT DATE(created_at) AS d, COUNT(*) AS c
    FROM messages
    WHERE owner_user_id=? AND \`from\`='client'
    GROUP BY DATE(created_at)
    ORDER BY d
  `);

  const leadsDaily = await q(`
    SELECT DATE(created_at) AS d, COUNT(*) AS c
    FROM client_leads
    WHERE owner_user_id=?
    GROUP BY DATE(created_at)
    ORDER BY d
  `);

  const escalationsDaily = await q(`
    SELECT DATE(created_at) AS d, COUNT(*) AS c
    FROM owner_notifications
    WHERE owner_user_id=? AND kind IN ('human_advisor','financing_detail_help','lead_interest')
    GROUP BY DATE(created_at)
    ORDER BY d
  `);

  return {
    overview,
    messagesByFrom,
    messagesByPlatform,
    conversationsByChannel,
    handoff,
    leadsByStatus,
    leadsByContact,
    topInterest,
    notificationsByKind,
    receiptsByStatus,
    msgsPerConv,
    convDurations,
    recentActivity,
    rawMessages,
    clientDaily,
    leadsDaily,
    escalationsDaily,
  };
}

function computeLatency(rawMessages) {
  const byConv = new Map();
  for (const m of rawMessages) {
    const list = byConv.get(m.conversation_id) || [];
    list.push(m);
    byConv.set(m.conversation_id, list);
  }

  const latencies = [];
  for (const list of byConv.values()) {
    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      if (cur.role !== "client") continue;
      // next bot/assistant reply
      for (let j = i + 1; j < list.length; j++) {
        const nxt = list[j];
        if (nxt.role === "client") break;
        if (!BOT_ROLES.has(nxt.role)) continue;
        const ms = new Date(nxt.created_at) - new Date(cur.created_at);
        if (ms >= 0 && ms <= RESPONSE_MAX_MS) latencies.push(ms);
        break;
      }
    }
  }
  latencies.sort((a, b) => a - b);
  return latencies;
}

function computeTemporal(rawMessages, timeZone) {
  const byHour = Array(24).fill(0);
  const byDow = Array(7).fill(0);
  for (const m of rawMessages) {
    if (m.role !== "client") continue;
    const p = zonedParts(new Date(m.created_at), timeZone);
    byHour[p.hour] += 1;
    byDow[p.weekday] += 1;
  }
  return { byHour, byDow };
}

function buildHistogram(valuesSec, edges) {
  const counts = Array(edges.length - 1).fill(0);
  for (const v of valuesSec) {
    for (let i = 0; i < edges.length - 1; i++) {
      if (v >= edges[i] && v < edges[i + 1]) {
        counts[i] += 1;
        break;
      }
      if (i === edges.length - 2 && v >= edges[i + 1]) counts[i] += 1;
    }
  }
  return counts;
}

function writeSvg(dir, name, svg) {
  const file = path.join(dir, name);
  writeFileSync(file, svg, "utf8");
  return name;
}

function buildReport(data, chartsRel, generatedAt) {
  const {
    overview,
    timeZone,
    messagesByFrom,
    messagesByPlatform,
    conversationsByChannel,
    handoff,
    leadsByStatus,
    leadsByContact,
    topInterest,
    notificationsByKind,
    receiptsByStatus,
    msgsPerConvCounts,
    durationSec,
    latencies,
    recentActivity,
    clientDaily,
    peakHour,
    peakDow,
  } = data;

  const totalMsg = Number(overview.messages) || 0;
  const totalConv = Number(overview.conversations) || 0;
  const totalLeads = Number(overview.leads) || 0;
  const botCount = messagesByFrom
    .filter((r) => BOT_ROLES.has(r.role))
    .reduce((s, r) => s + Number(r.c), 0);
  const clientCount = Number(messagesByFrom.find((r) => r.role === "client")?.c || 0);
  const sellerCount = Number(messagesByFrom.find((r) => r.role === "seller")?.c || 0);

  const handed = Number(handoff.handed_off) || 0;
  const handoffRate = totalConv ? handed / totalConv : 0;

  const leadsActive = leadsByStatus.filter((r) => r.status !== "eliminated");
  const leadsActiveTotal = leadsActive.reduce((s, r) => s + Number(r.c), 0);
  const sold = Number(leadsByStatus.find((r) => r.status === "sold")?.c || 0);
  const conversion = leadsActiveTotal ? sold / leadsActiveTotal : 0;

  const minMsg = overview.min_msg ? new Date(overview.min_msg) : null;
  const maxMsg = overview.max_msg ? new Date(overview.max_msg) : null;
  const spanDays =
    minMsg && maxMsg
      ? Math.max(1, (maxMsg - minMsg) / (1000 * 60 * 60 * 24))
      : 1;
  const msgsPerDay = totalMsg / spanDays;
  const clientMsgsPerDay = clientCount / spanDays;

  const latSorted = [...latencies].sort((a, b) => a - b);
  const latMean = mean(latSorted);
  const latP50 = percentile(latSorted, 0.5);
  const latP90 = percentile(latSorted, 0.9);
  const latP95 = percentile(latSorted, 0.95);

  const mpcSorted = [...msgsPerConvCounts].sort((a, b) => a - b);
  const durSorted = [...durationSec].sort((a, b) => a - b);

  const escTotal = notificationsByKind.reduce((s, r) => s + Number(r.c), 0);
  const escAdvisor = Number(
    notificationsByKind.find((r) => r.kind === "human_advisor")?.c || 0
  );
  const escFin = Number(
    notificationsByKind.find((r) => r.kind === "financing_detail_help")?.c || 0
  );
  const escLead = Number(
    notificationsByKind.find((r) => r.kind === "lead_interest")?.c || 0
  );

  const receiptTotal = receiptsByStatus.reduce((s, r) => s + Number(r.c), 0);
  const receiptFailed = Number(receiptsByStatus.find((r) => r.status === "failed")?.c || 0);
  const receiptProcessed = Number(
    receiptsByStatus.find((r) => r.status === "processed")?.c || 0
  );

  const img = (name, alt) => `![${alt}](${chartsRel}/${name})`;

  const ROLE_LABEL = {
    client: "Cliente",
    assistant: "Bot",
    bot: "Bot",
    seller: "Vendedor / asesor",
    user: "Usuario interno",
    system: "Sistema (avisos automáticos)",
  };
  const STATUS_LABEL = {
    lead: "Lead nuevo",
    negotiation: "En negociación",
    sold: "Vendido",
    lost: "Perdido",
    eliminated: "Eliminado",
  };
  const CHANNEL_LABEL = {
    whatsapp: "WhatsApp",
    facebook: "Facebook",
    telegram: "Telegram",
    web: "Web",
    api: "API / integraciones",
    instagram: "Instagram",
  };
  const CONTACT_LABEL = {
    whatsapp: "WhatsApp",
    call: "Llamada",
    appointment: "Cita en agencia",
    "(sin definir)": "Sin definir",
  };
  const NOTIF_LABEL = {
    human_advisor: "Pedir asesor humano",
    financing_detail_help: "Ayuda con financiamiento",
    lead_interest: "Cliente mostró interés",
  };
  const RECEIPT_LABEL = {
    accepted: "Recibido",
    processed: "Procesado correctamente",
    ignored: "Ignorado (duplicado o no aplica)",
    failed: "Falló al procesarse",
  };

  const label = (map, key) => map[key] || String(key);

  const fmtDateEs = (d) =>
    d
      ? d.toLocaleDateString("es-MX", {
          timeZone,
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "—";

  const roleTable = messagesByFrom
    .map(
      (r) =>
        `| ${label(ROLE_LABEL, r.role)} | ${fmtNum(r.c)} | ${fmtPct(totalMsg ? Number(r.c) / totalMsg : 0)} |`
    )
    .join("\n");

  const statusTable = leadsByStatus
    .map(
      (r) =>
        `| ${label(STATUS_LABEL, r.status)} | ${fmtNum(r.c)} | ${fmtPct(totalLeads ? Number(r.c) / totalLeads : 0)} |`
    )
    .join("\n");

  const channelTable = conversationsByChannel
    .map(
      (r) =>
        `| ${label(CHANNEL_LABEL, r.channel)} | ${fmtNum(r.c)} | ${fmtPct(totalConv ? Number(r.c) / totalConv : 0)} |`
    )
    .join("\n");

  const interestTable = topInterest
    .map((r) => `| ${String(r.interest).replace(/\|/g, "/")} | ${fmtNum(r.c)} |`)
    .join("\n");

  const contactTable = leadsByContact
    .map(
      (r) =>
        `| ${label(CONTACT_LABEL, r.contact_method)} | ${fmtNum(r.c)} |`
    )
    .join("\n");

  const notifTable = notificationsByKind
    .map((r) => `| ${label(NOTIF_LABEL, r.kind)} | ${fmtNum(r.c)} |`)
    .join("\n");

  const receiptTable = receiptsByStatus
    .map(
      (r) =>
        `| ${label(RECEIPT_LABEL, r.status)} | ${fmtNum(r.c)} | ${fmtPct(receiptTotal ? Number(r.c) / receiptTotal : 0)} |`
    )
    .join("\n");

  const platformTable = messagesByPlatform
    .map(
      (r) =>
        `| ${label(CHANNEL_LABEL, r.platform) || r.platform} | ${fmtNum(r.c)} |`
    )
    .join("\n");

  const periodStart = fmtDateEs(minMsg);
  const periodEnd = fmtDateEs(maxMsg);
  const genDate = fmtDateEs(new Date(generatedAt));

  return `# ¿Cómo está rindiendo el bot de atención?

**${overview.owner_name || "Negocio"}**  
Periodo: **${periodStart}** al **${periodEnd}** (horario de ${timeZone.replace(/_/g, " ")})  
Reporte elaborado el ${genDate}

Este documento resume, en lenguaje de negocio, cómo se está usando el asistente virtual con los clientes: cuánto conversan, qué tan rápido responde, cuándo piden un asesor humano y cómo avanza el embudo comercial.

---

## 1. Lo más importante (en una mirada)

| Indicador | Resultado | ¿Qué significa? |
| --- | --- | --- |
| Conversaciones con clientes | **${fmtNum(totalConv)}** | Cuántas personas distintas abrieron un chat |
| Contactos / leads registrados | **${fmtNum(totalLeads)}** | Prospectos capturados en el CRM |
| Mensajes en total | **${fmtNum(totalMsg)}** | Actividad total del canal en el periodo |
| Mensajes de clientes al día | **${fmtNum(clientMsgsPerDay, 1)}** | Demanda promedio diaria (~${fmtNum(spanDays, 0)} días) |
| Parte de la charla atendida por el bot | **${fmtPct(totalMsg ? botCount / totalMsg : 0)}** | Qué tan automatizada está la atención |
| Conversaciones pasadas a un asesor | **${fmtPct(handoffRate)}** (${fmtNum(handed)} de ${fmtNum(totalConv)}) | Casos en los que intervino una persona |
| Ventas registradas en el embudo | **${fmtPct(conversion)}** (${fmtNum(sold)} de ${fmtNum(leadsActiveTotal)}) | Contactos marcados como vendidos |
| Tiempo típico de respuesta del bot | **${fmtDurationMs(latP50)}** | Lo que suele esperar el cliente (valor medio) |
| Respuestas más lentas (casi el peor 5 %) | **${fmtDurationMs(latP95)}** | Casos lentos pero aún “en línea” |

### Lectura rápida

En este periodo el bot escribió **${fmtNum(botCount)}** mensajes y los asesores humanos solo **${fmtNum(sellerCount)}**. Eso indica que la mayor parte de la atención diaria la cubre el asistente. Casi **${fmtPct(handoffRate)}** de las conversaciones sí pasaron en algún momento a una persona: el bot filtra y atiende, y escala cuando hace falta.

El cliente suele recibir respuesta en alrededor de **${fmtDurationMs(latP50)}**. Nueve de cada diez respuestas llegan en **${fmtDurationMs(latP90)}** o menos.

---

## 2. ¿Cuándo escriben los clientes?

### 2.1 Por hora del día

Se cuenta cuántos mensajes envían los clientes en cada hora, usando el horario local del negocio.

${img("client-by-hour.svg", "Mensajes de cliente por hora del día")}

**Dato clave:** el pico es a las **${peakHour.label}**, con **${fmtNum(peakHour.value)}** mensajes (${fmtPct(clientCount ? peakHour.value / clientCount : 0)} de todo lo que escriben los clientes).

**Para qué sirve:** saber a qué hora conviene tener el bot activo y, si hace falta, un asesor disponible. Reforzar cobertura en ese horario reduce esperas y abandonos.

### 2.2 Por día de la semana

${img("client-by-dow.svg", "Mensajes de cliente por día de la semana")}

**Dato clave:** el día más activo es **${peakDow.label}**, con **${fmtNum(peakDow.value)}** mensajes de clientes.

**Para qué sirve:** planear turnos, campañas y seguimiento comercial en los días de mayor intención de compra.

### 2.3 Evolución día a día

${img("client-daily.svg", "Serie diaria de mensajes de cliente")}

**Para qué sirve:** ver si el canal crece, se mantiene o tiene picos puntuales (por ejemplo, una promoción). Que el bot cubra casi toda la charla mientras los asesores intervienen poco (${fmtNum(sellerCount)} mensajes en todo el periodo) sugiere que se puede atender más volumen sin aumentar el equipo en la misma proporción.

---

## 3. ¿Qué tan rápido y profundo atiende el bot?

### 3.1 Velocidad de respuesta

Se mide el tiempo entre un mensaje del cliente y la siguiente respuesta del bot en la misma conversación (solo si responde en menos de 30 minutos). Es una estimación práctica de la experiencia del cliente; puede incluir pequeños retrasos de agrupación de mensajes.

| Medida | Valor |
| --- | --- |
| Conversaciones medidas (turnos) | ${fmtNum(latSorted.length)} |
| Tiempo promedio | ${fmtDurationMs(latMean)} |
| Tiempo típico (mitad de los casos) | ${fmtDurationMs(latP50)} |
| 9 de cada 10 respuestas | ${fmtDurationMs(latP90)} o menos |
| Casi todas (95 de cada 100) | ${fmtDurationMs(latP95)} o menos |
| La más rápida | ${fmtDurationMs(latSorted[0])} |
| La más lenta (dentro del límite) | ${fmtDurationMs(latSorted[latSorted.length - 1])} |

${img("response-latency-hist.svg", "Distribución del tiempo de respuesta del bot")}

**Para qué sirve:** el “tiempo típico” describe la experiencia normal; el 5 % más lento es donde suele aparecer la frustración. Si ese extremo se aleja mucho del típico, conviene revisar congestión o casos difíciles.

### 3.2 Qué tan largas son las conversaciones

| Medida | Valor |
| --- | --- |
| Mensajes por chat (promedio) | ${fmtNum(mean(mpcSorted), 1)} |
| Mensajes por chat (valor típico) | ${fmtNum(median(mpcSorted), 1)} |
| Duración del chat (promedio) | ${fmtDurationMs(mean(durSorted) * 1000)} |
| Duración del chat (típica) | ${fmtDurationMs(median(durSorted) * 1000)} |
| Chats largos (9 de cada 10 duran menos que…) | ${fmtDurationMs(percentile(durSorted, 0.9) * 1000)} |

${img("msgs-per-conversation.svg", "Distribución de mensajes por conversación")}

**Para qué sirve:** chats muy cortos pueden ser consultas rápidas o abandonos; chats muy largos suelen indicar dudas de financiamiento, comparación de modelos o necesidad de un asesor. Un promedio de **${fmtNum(mean(mpcSorted), 1)}** mensajes por conversación muestra que hay diálogo real, no solo un saludo.

---

## 4. ¿Cuándo entra un asesor humano?

| Indicador | Resultado |
| --- | --- |
| Conversaciones totales | ${fmtNum(totalConv)} |
| Pasaron a control de un asesor | ${fmtNum(handed)} (${fmtPct(handoffRate)}) |
| Recibieron recordatorio automático | ${fmtNum(handoff.with_reminder)} (${fmtPct(totalConv ? Number(handoff.with_reminder) / totalConv : 0)}) |
| Tiempo promedio hasta pedir asesor | ${fmtDurationMs(Number(handoff.avg_handoff_sec) * 1000)} |
| Duración promedio de la conversación | ${fmtDurationMs(Number(handoff.avg_duration_sec) * 1000)} |
| Con actividad en la última semana | ${fmtNum(recentActivity.active_7d)} |
| Con actividad en el último mes | ${fmtNum(recentActivity.active_30d)} |
| Sin actividad reciente (más de 30 días) | ${fmtNum(recentActivity.inactive_30d)} |

**Para qué sirve:** si cerca de la mitad de los chats pasan a una persona, el bot está haciendo el primer filtro y liberando al equipo para cierres. El tiempo hasta pedir asesor indica cuánto trabajo previo ya hizo el bot. Los recordatorios automáticos reactivan conversaciones frías sin que alguien tenga que escribir primero.

### ¿Por qué canal llegan?

| Canal | Conversaciones | % |
| --- | --- | --- |
${channelTable}

${img("conversations-by-channel.svg", "Conversaciones por canal")}

### ¿Dónde se concentran los mensajes?

| Canal / plataforma | Mensajes |
| --- | --- |
${platformTable}

${img("messages-by-platform.svg", "Mensajes por plataforma")}

---

## 5. Embudo comercial (leads)

### 5.1 ¿En qué etapa están los contactos?

| Etapa | Contactos | % |
| --- | --- | --- |
${statusTable}

${img("leads-by-status.svg", "Leads por etapa")}

**Para qué sirve:** el porcentaje marcado como **Vendido** (${fmtPct(conversion)}) es el resultado comercial más directo. Muchos leads “nuevos” o “en negociación” con pocas ventas sugieren oportunidad de mejorar el cierre, el financiamiento o la velocidad con la que un asesor toma el caso.

### 5.2 Contactos nuevos cada día

${img("leads-daily.svg", "Leads nuevos por día")}

### 5.3 ¿Qué vehículos interesan más?

| Interés | Contactos |
| --- | --- |
${interestTable}

${img("top-interest.svg", "Top intereses de vehículos")}

**Para qué sirve:** priorizar stock, promociones y respuestas del bot en los modelos que más preguntan los clientes.

### 5.4 ¿Cómo prefieren que los contacten?

| Preferencia | Contactos |
| --- | --- |
${contactTable}

---

## 6. Avisos al equipo y confiabilidad del canal

### 6.1 ¿De qué se avisa al negocio?

| Tipo de aviso | Cantidad |
| --- | --- |
${notifTable}

- Veces que se pidió ayuda humana (asesor o financiamiento): **${fmtNum(escAdvisor + escFin)}**
- Veces que un cliente mostró interés claro: **${fmtNum(escLead)}**
- Avisos por conversación (promedio): **${fmtNum(totalConv ? escTotal / totalConv : 0, 2)}**

${img("notifications-by-kind.svg", "Avisos al negocio por tipo")}

${img("escalations-daily.svg", "Avisos al negocio por día")}

**Para qué sirve:** los avisos de “interés” miden oportunidades calientes; los de “asesor / financiamiento” miden carga que el bot no resolvió solo. Si hay muchos avisos por conversación, conviene reforzar respuestas sobre precios, planes de pago o disponibilidad.

### 6.2 ¿El canal (WhatsApp / redes) está estable?

Cada mensaje entrante del canal se registra como un evento. Aquí se ve cuántos se procesaron bien y cuántos fallaron.

| Resultado | Eventos | % |
| --- | --- | --- |
${receiptTable}

- Procesados correctamente: **${fmtNum(receiptProcessed)}** (${fmtPct(receiptTotal ? receiptProcessed / receiptTotal : 0)})
- Con error: **${fmtNum(receiptFailed)}** (${fmtPct(receiptTotal ? receiptFailed / receiptTotal : 0)})

${img("receipts-by-status.svg", "Resultado de eventos del canal")}

**Para qué sirve:** si suben los errores, pueden perderse mensajes de clientes “en silencio” y las cifras de demanda se verán artificialmente bajas.

### 6.3 ¿Quién escribe en el chat?

| Quién escribe | Mensajes | % |
| --- | --- | --- |
${roleTable}

${img("messages-by-role.svg", "Mensajes según quién escribe")}

---

## 7. Cómo leer este reporte (y qué no incluye)

1. El tiempo de respuesta es una **estimación de la experiencia del cliente**, no un cronómetro de laboratorio: puede incluir pequeños retrasos al juntar varios mensajes seguidos.
2. Las ventas dependen de que el equipo marque el contacto como “Vendido” en el CRM; si esa etapa no se actualiza, la conversión aparecerá baja aunque haya cierres reales.
3. “Conversaciones activas” aquí significa que hubo mensaje reciente (última semana / último mes), no solo que el chat exista en el sistema.
4. Próximos pasos útiles para el negocio:
   - Revisar cobertura humana en el horario pico (${peakHour.label}) y el día pico (${peakDow.label}).
   - Alinear inventario y promociones con los modelos más consultados.
   - Dar seguimiento a leads en negociación para subir la conversión a venta.
   - Vigilar que el porcentaje de errores del canal se mantenga bajo.

---

## Glosario breve

| Término | Significado sencillo |
| --- | --- |
| Conversación | Un chat con un cliente |
| Lead / contacto | Prospecto registrado para seguimiento comercial |
| Tiempo de respuesta | Cuánto tarda el bot en contestar después del cliente |
| Pasar a asesor | Cuando una persona del equipo toma el control del chat |
| Recordatorio | Mensaje automático para reactivar un chat inactivo |
| Conversión a venta | Contactos marcados como vendidos sobre el total activo |

## Números de respaldo

| Concepto | Cantidad |
| --- | --- |
| Mensajes | ${fmtNum(totalMsg)} |
| Conversaciones | ${fmtNum(totalConv)} |
| Contactos | ${fmtNum(totalLeads)} |
| Avisos al negocio | ${fmtNum(overview.notifications)} |
| Eventos del canal | ${fmtNum(overview.receipts)} |
| Días con actividad de clientes | ${fmtNum(clientDaily.length)} |
| Turnos usados para medir velocidad | ${fmtNum(latSorted.length)} |

---

*Reporte de rendimiento del asistente virtual — ${overview.owner_name || "negocio"}.*
`;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const dateTag = generatedAt.slice(0, 10);
  const short = TENANT.slice(0, 8);
  const outDir = path.join(ROOT, "docs/reports");
  const assetsDir = path.join(outDir, "assets", `${short}-${dateTag}`);
  mkdirSync(assetsDir, { recursive: true });

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: false,
  });

  console.log(`Consultando tenant ${TENANT}…`);
  const raw = await queryAll(conn, TENANT);
  await conn.end();

  const timeZone = raw.overview.tz || TZ_FALLBACK;
  const latencies = computeLatency(raw.rawMessages);
  const { byHour, byDow } = computeTemporal(raw.rawMessages, timeZone);

  const hourLabels = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
  const peakHourIdx = byHour.indexOf(Math.max(...byHour));
  const peakDowIdx = byDow.indexOf(Math.max(...byDow));

  const dowLabelsOrdered = DAY_ORDER.map((d) => DAY_NAMES[d]);
  const dowValuesOrdered = DAY_ORDER.map((d) => byDow[d]);

  const clientDailyLabels = raw.clientDaily.map((r) => {
    const d = r.d instanceof Date ? r.d.toISOString().slice(0, 10) : String(r.d).slice(0, 10);
    return d;
  });
  const clientDailyValues = raw.clientDaily.map((r) => Number(r.c));

  const leadsDailyLabels = raw.leadsDaily.map((r) => {
    const d = r.d instanceof Date ? r.d.toISOString().slice(0, 10) : String(r.d).slice(0, 10);
    return d;
  });
  const leadsDailyValues = raw.leadsDaily.map((r) => Number(r.c));

  const escDailyLabels = raw.escalationsDaily.map((r) => {
    const d = r.d instanceof Date ? r.d.toISOString().slice(0, 10) : String(r.d).slice(0, 10);
    return d;
  });
  const escDailyValues = raw.escalationsDaily.map((r) => Number(r.c));

  const latSec = latencies.map((ms) => ms / 1000);
  const histEdges = [0, 5, 10, 20, 30, 60, 120, 300, 600, 1800];
  const histCounts = buildHistogram(latSec, histEdges);

  const mpc = raw.msgsPerConv.map((r) => Number(r.c));
  // bucket messages-per-conversation
  const mpcEdges = [1, 2, 4, 6, 10, 15, 25, 50, 100, 500];
  const mpcCounts = buildHistogram(mpc, mpcEdges);
  const mpcLabels = mpcEdges.slice(0, -1).map((e, i) => `${e}–${mpcEdges[i + 1] - 1}`);

  const durationSec = raw.convDurations.map((r) => Number(r.duration_sec) || 0);

  const CHART_ROLE = {
    client: "Cliente",
    assistant: "Bot",
    bot: "Bot",
    seller: "Asesor",
    user: "Usuario",
    system: "Sistema",
  };
  const CHART_STATUS = {
    lead: "Lead nuevo",
    negotiation: "Negociación",
    sold: "Vendido",
    lost: "Perdido",
    eliminated: "Eliminado",
  };
  const CHART_CHANNEL = {
    whatsapp: "WhatsApp",
    facebook: "Facebook",
    telegram: "Telegram",
    web: "Web",
    api: "API",
    instagram: "Instagram",
  };
  const CHART_NOTIF = {
    human_advisor: "Pedir asesor",
    financing_detail_help: "Financiamiento",
    lead_interest: "Mostró interés",
  };
  const CHART_RECEIPT = {
    accepted: "Recibido",
    processed: "OK",
    ignored: "Ignorado",
    failed: "Con error",
  };
  const chartLabel = (map, key) => map[key] || String(key);

  // Charts
  writeSvg(
    assetsDir,
    "client-by-hour.svg",
    barChartSvg({
      title: "Mensajes de cliente por hora del día",
      labels: hourLabels,
      values: byHour,
      xLabel: `Hora local (${timeZone.replace(/_/g, " ")})`,
      yLabel: "Mensajes de cliente",
      color: "#2563eb",
    })
  );
  writeSvg(
    assetsDir,
    "client-by-dow.svg",
    barChartSvg({
      title: "Mensajes de cliente por día de la semana",
      labels: dowLabelsOrdered,
      values: dowValuesOrdered,
      xLabel: "Día de la semana",
      yLabel: "Mensajes de cliente",
      color: "#0284c7",
      width: 720,
    })
  );
  writeSvg(
    assetsDir,
    "client-daily.svg",
    lineChartSvg({
      title: "Mensajes de cliente por día",
      labels: clientDailyLabels,
      values: clientDailyValues,
      xLabel: "Fecha",
      yLabel: "Mensajes de cliente",
    })
  );
  writeSvg(
    assetsDir,
    "response-latency-hist.svg",
    histogramSvg({
      title: "¿Cuánto tarda el bot en responder?",
      edges: histEdges,
      counts: histCounts,
      xLabel: "Tiempo de respuesta",
      yLabel: "Cantidad de respuestas",
      color: "#7c3aed",
    })
  );
  writeSvg(
    assetsDir,
    "msgs-per-conversation.svg",
    barChartSvg({
      title: "Distribución de mensajes por conversación",
      labels: mpcLabels,
      values: mpcCounts,
      xLabel: "Mensajes por conversación",
      yLabel: "Conversaciones",
      color: "#059669",
      width: 780,
    })
  );
  writeSvg(
    assetsDir,
    "conversations-by-channel.svg",
    barChartSvg({
      title: "Conversaciones por canal",
      labels: raw.conversationsByChannel.map((r) => chartLabel(CHART_CHANNEL, r.channel)),
      values: raw.conversationsByChannel.map((r) => Number(r.c)),
      xLabel: "Canal",
      yLabel: "Conversaciones",
      color: "#d97706",
      width: 640,
    })
  );
  writeSvg(
    assetsDir,
    "messages-by-platform.svg",
    barChartSvg({
      title: "Mensajes por canal",
      labels: raw.messagesByPlatform.map((r) => chartLabel(CHART_CHANNEL, r.platform)),
      values: raw.messagesByPlatform.map((r) => Number(r.c)),
      xLabel: "Canal",
      yLabel: "Mensajes",
      color: "#ea580c",
      width: 640,
    })
  );
  writeSvg(
    assetsDir,
    "leads-by-status.svg",
    barChartSvg({
      title: "Contactos por etapa comercial",
      labels: raw.leadsByStatus.map((r) => chartLabel(CHART_STATUS, r.status)),
      values: raw.leadsByStatus.map((r) => Number(r.c)),
      xLabel: "Etapa",
      yLabel: "Contactos",
      color: "#dc2626",
      width: 700,
    })
  );
  writeSvg(
    assetsDir,
    "leads-daily.svg",
    lineChartSvg({
      title: "Contactos nuevos por día",
      labels: leadsDailyLabels,
      values: leadsDailyValues,
      xLabel: "Fecha",
      yLabel: "Contactos nuevos",
      color: "#be123c",
    })
  );
  writeSvg(
    assetsDir,
    "top-interest.svg",
    barChartSvg({
      title: "Vehículos que más interesan",
      labels: raw.topInterest.map((r) => String(r.interest).slice(0, 28)),
      values: raw.topInterest.map((r) => Number(r.c)),
      xLabel: "Modelo / interés",
      yLabel: "Contactos",
      color: "#4f46e5",
      width: 960,
    })
  );
  writeSvg(
    assetsDir,
    "notifications-by-kind.svg",
    barChartSvg({
      title: "Avisos al negocio por tipo",
      labels: raw.notificationsByKind.map((r) => chartLabel(CHART_NOTIF, r.kind)),
      values: raw.notificationsByKind.map((r) => Number(r.c)),
      xLabel: "Tipo de aviso",
      yLabel: "Cantidad",
      color: "#9333ea",
      width: 780,
    })
  );
  writeSvg(
    assetsDir,
    "escalations-daily.svg",
    lineChartSvg({
      title: "Avisos al negocio por día",
      labels: escDailyLabels,
      values: escDailyValues,
      xLabel: "Fecha",
      yLabel: "Avisos",
      color: "#a21caf",
    })
  );
  writeSvg(
    assetsDir,
    "receipts-by-status.svg",
    barChartSvg({
      title: "Estabilidad del canal (mensajes entrantes)",
      labels: raw.receiptsByStatus.map((r) => chartLabel(CHART_RECEIPT, r.status)),
      values: raw.receiptsByStatus.map((r) => Number(r.c)),
      xLabel: "Resultado",
      yLabel: "Cantidad",
      color: "#0f766e",
      width: 640,
    })
  );
  writeSvg(
    assetsDir,
    "messages-by-role.svg",
    barChartSvg({
      title: "¿Quién escribe en el chat?",
      labels: raw.messagesByFrom.map((r) => chartLabel(CHART_ROLE, r.role)),
      values: raw.messagesByFrom.map((r) => Number(r.c)),
      xLabel: "Quién escribe",
      yLabel: "Mensajes",
      color: "#1d4ed8",
      width: 640,
    })
  );

  const chartsRel = `assets/${short}-${dateTag}`;
  const md = buildReport(
    {
      overview: raw.overview,
      timeZone,
      messagesByFrom: raw.messagesByFrom,
      messagesByPlatform: raw.messagesByPlatform,
      conversationsByChannel: raw.conversationsByChannel,
      handoff: raw.handoff,
      leadsByStatus: raw.leadsByStatus,
      leadsByContact: raw.leadsByContact,
      topInterest: raw.topInterest,
      notificationsByKind: raw.notificationsByKind,
      receiptsByStatus: raw.receiptsByStatus,
      msgsPerConvCounts: mpc,
      durationSec,
      latencies,
      recentActivity: raw.recentActivity,
      clientDaily: raw.clientDaily,
      peakHour: { label: hourLabels[peakHourIdx], value: byHour[peakHourIdx] },
      peakDow: { label: DAY_NAMES[peakDowIdx], value: byDow[peakDowIdx] },
    },
    chartsRel,
    generatedAt
  );

  const mdName = `metricas-bot-${short}-${dateTag}.md`;
  const mdPath = path.join(outDir, mdName);
  writeFileSync(mdPath, md, "utf8");
  console.log(`Markdown: ${mdPath}`);

  // Also dump JSON summary for debugging / reuse
  const summaryPath = path.join(assetsDir, "summary.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        tenant: TENANT,
        generatedAt,
        timeZone,
        overview: raw.overview,
        byHour,
        byDow,
        latency: {
          n: latencies.length,
          mean: mean(latencies),
          p50: percentile([...latencies].sort((a, b) => a - b), 0.5),
          p90: percentile([...latencies].sort((a, b) => a - b), 0.9),
          p95: percentile([...latencies].sort((a, b) => a - b), 0.95),
        },
      },
      null,
      2
    ),
    "utf8"
  );

  // PDF via md-to-pdf (puppeteer). Run from outDir so relative image paths resolve.
  const pdfName = `metricas-bot-${short}-${dateTag}.pdf`;
  const pdfPath = path.join(outDir, pdfName);
  console.log("Generando PDF con md-to-pdf…");
  const result = spawnSync(
    "npx",
    ["--yes", "md-to-pdf", mdName, "--pdf-options", JSON.stringify({ format: "A4", printBackground: true, margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" } })],
    {
      cwd: outDir,
      encoding: "utf8",
      env: { ...process.env, PUPPETEER_DISABLE_DEV_SHM_USAGE: "true" },
    }
  );
  if (result.status !== 0) {
    console.error(result.stdout || "");
    console.error(result.stderr || "");
    console.warn("PDF no generado automáticamente. Markdown listo en:", mdPath);
    console.warn("Comando manual: cd docs/reports && npx --yes md-to-pdf", mdName);
  } else {
    console.log(`PDF: ${pdfPath}`);
    if (!existsSync(pdfPath)) {
      // md-to-pdf writes beside the md file
      console.warn("Verificar salida PDF; stdout:", result.stdout);
    }
  }

  console.log("Listo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
