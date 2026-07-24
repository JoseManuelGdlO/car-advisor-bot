import { describe, expect, it } from "vitest";
import { formatConversationPreview } from "./crmEventLabels";

const SAMPLE_CAMPAIGN = [
  "Hola!, Quiero más información",
  "",
  "📢 Campaña CTWA",
  "Título: Suzuki Swift Boostergreen 2026",
  "Origen: Facebook",
  "https://fb.me/test-swift",
  "",
  "Conoce el nuevo Swift Boostergreen 2026. Escríbenos para más información y además te contamos todos los beneficios de la promoción vigente.",
].join("\n");

describe("formatConversationPreview", () => {
  it("mapea slugs CRM conocidos", () => {
    expect(formatConversationPreview("human_advisor_requested")).toBe(
      "Cliente pidió hablar con un asesor",
    );
  });

  it("sin compactCampaign deja el texto de campaña completo", () => {
    expect(formatConversationPreview(SAMPLE_CAMPAIGN)).toBe(SAMPLE_CAMPAIGN);
  });

  it("con compactCampaign omite body largo y prioriza título", () => {
    const preview = formatConversationPreview(SAMPLE_CAMPAIGN, { compactCampaign: true });
    expect(preview).toContain("Hola!, Quiero más información");
    expect(preview).toContain("Suzuki Swift Boostergreen 2026");
    expect(preview.length).toBeLessThanOrEqual(120);
    expect(preview).not.toContain("https://fb.me/test-swift");
  });

  it("compacta fallback sin title/body", () => {
    const raw = "Hola\n\n📢 Entró desde campaña (Instagram)";
    expect(formatConversationPreview(raw, { compactCampaign: true })).toBe(
      "Hola · 📢 Entró desde campaña (Instagram)",
    );
  });
});
