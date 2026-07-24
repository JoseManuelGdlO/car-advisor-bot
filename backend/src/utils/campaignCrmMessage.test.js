import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMPAIGN_CRM_FALLBACK_PREFIX,
  CAMPAIGN_CRM_MARKER,
  formatCampaignCrmMessage,
  formatCampaignSourceLabel,
} from "./campaignCrmMessage.js";

test("formatCampaignSourceLabel normaliza facebook e instagram", () => {
  assert.equal(formatCampaignSourceLabel("facebook"), "Facebook");
  assert.equal(formatCampaignSourceLabel("instagram"), "Instagram");
  assert.equal(formatCampaignSourceLabel("ig_ads"), "Instagram");
  assert.equal(formatCampaignSourceLabel(""), "");
});

test("formatCampaignCrmMessage sin adContext deja el mensaje intacto", () => {
  assert.equal(formatCampaignCrmMessage("Hola", null), "Hola");
  assert.equal(formatCampaignCrmMessage("Hola", { isAd: false, title: "X" }), "Hola");
});

test("formatCampaignCrmMessage incluye título, origen, url y body", () => {
  const text = formatCampaignCrmMessage("Hola!, Quiero más información", {
    isAd: true,
    title: "Suzuki Swift Boostergreen 2026",
    body: "Conoce el nuevo Swift.",
    sourceApp: "facebook",
    sourceUrl: "https://fb.me/test-swift",
  });

  assert.match(text, /^Hola!, Quiero más información\n\n/);
  assert.match(text, new RegExp(CAMPAIGN_CRM_MARKER));
  assert.match(text, /Título: Suzuki Swift Boostergreen 2026/);
  assert.match(text, /Origen: Facebook/);
  assert.match(text, /https:\/\/fb\.me\/test-swift/);
  assert.match(text, /Conoce el nuevo Swift\./);
});

test("formatCampaignCrmMessage sin title/body usa fallback con plataforma", () => {
  const text = formatCampaignCrmMessage("Hola", {
    isAd: true,
    title: null,
    body: null,
    sourceApp: "instagram",
  });

  assert.equal(text, `Hola\n\n${CAMPAIGN_CRM_FALLBACK_PREFIX} (Instagram)`);
});

test("formatCampaignCrmMessage sin title/body ni sourceApp usa fallback genérico", () => {
  const text = formatCampaignCrmMessage("Hola", {
    isAd: true,
  });

  assert.equal(text, `Hola\n\n${CAMPAIGN_CRM_FALLBACK_PREFIX}`);
});
