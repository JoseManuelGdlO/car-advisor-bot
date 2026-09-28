import { describe, expect, it } from "vitest";
import type { IntegrationDto } from "@/services/integrations";
import {
  isWhatsAppMetaConnected,
  selectWhatsAppMetaIntegration,
  whatsAppMetaDisplayPhone,
} from "@/lib/whatsappMeta";

const base = (overrides: Partial<IntegrationDto>): IntegrationDto => ({
  id: "id",
  channel: "whatsapp",
  provider: "meta",
  displayName: null,
  status: "draft",
  webhookUrl: null,
  lastHealthcheckAt: null,
  lastError: null,
  hasActiveCredential: false,
  ...overrides,
});

describe("selectWhatsAppMetaIntegration", () => {
  it("ignora Instagram y WhatsApp Connect y elige solo WhatsApp Cloud", () => {
    const meta = base({ id: "wa-meta", status: "active", hasActiveCredential: true });
    const picked = selectWhatsAppMetaIntegration([
      base({ id: "ig", channel: "instagram", provider: "meta" }),
      base({ id: "wc", provider: "whatsapp-connect" }),
      meta,
    ]);
    expect(picked?.id).toBe("wa-meta");
  });

  it("devuelve null si no hay WhatsApp Meta", () => {
    expect(
      selectWhatsAppMetaIntegration([base({ id: "ig", channel: "instagram", provider: "meta" })]),
    ).toBeNull();
  });
});

describe("isWhatsAppMetaConnected", () => {
  it("solo está conectado con credencial activa y status active", () => {
    expect(isWhatsAppMetaConnected(null)).toBe(false);
    expect(isWhatsAppMetaConnected(base({ status: "active", hasActiveCredential: false }))).toBe(false);
    expect(isWhatsAppMetaConnected(base({ status: "disabled", hasActiveCredential: true }))).toBe(false);
    expect(isWhatsAppMetaConnected(base({ status: "active", hasActiveCredential: true }))).toBe(true);
  });
});

describe("whatsAppMetaDisplayPhone", () => {
  it("devuelve el número recortado o null", () => {
    expect(whatsAppMetaDisplayPhone(base({ displayPhoneNumber: "  +52 1  " }))).toBe("+52 1");
    expect(whatsAppMetaDisplayPhone(base({ displayPhoneNumber: "" }))).toBeNull();
    expect(whatsAppMetaDisplayPhone(null)).toBeNull();
  });
});
