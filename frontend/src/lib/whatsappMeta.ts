import type { IntegrationDto } from "@/services/integrations";

export function selectWhatsAppMetaIntegration(integrations: IntegrationDto[]): IntegrationDto | null {
  return integrations.find((it) => it.channel === "whatsapp" && it.provider === "meta") ?? null;
}

export function isWhatsAppMetaConnected(integration: IntegrationDto | null | undefined): boolean {
  return Boolean(integration?.hasActiveCredential && integration.status === "active");
}

export function whatsAppMetaDisplayPhone(integration: IntegrationDto | null | undefined): string | null {
  const phone = integration?.displayPhoneNumber?.trim();
  return phone || null;
}
