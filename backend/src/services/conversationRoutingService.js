import { normalizeWcInboundEvent } from "./wcEventNormalizer.js";
import { ingestWhatsappConnectEvent } from "./wcWebhookIngestionService.js";

export const routeWhatsappConnectWebhookEvent = async ({ payload, integration, credentials }) => {
  // Encadena normalización + ingestión para mantener único punto de orquestación.
  const normalizedEvent = normalizeWcInboundEvent({ payload, integration, credentials });
  return ingestWhatsappConnectEvent({ normalizedEvent, credentials });
};
