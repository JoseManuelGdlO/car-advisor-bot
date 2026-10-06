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

export function metaSignupHint(configured: boolean | undefined): string | null {
  if (configured === false) {
    return "Falta configurar META_APP_ID, META_APP_SECRET y META_EMBEDDED_SIGNUP_CONFIG_ID en el servidor.";
  }
  if (configured === true) {
    return "Pulsa «Conectar con Facebook» para vincular tu WhatsApp Business. Se abre una ventana de Meta; al terminar, el bot puede responder en ese número.";
  }
  return null;
}
