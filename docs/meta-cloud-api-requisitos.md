# Requisitos: WhatsApp Cloud API (Meta)

Enfoque **B**: Cloud API + Embedded Signup sobre el modelo actual (`channel_integrations` + `channel_credentials`), el mismo patrón que Instagram Meta. No se copian las tablas duales `whatsapp_integrations` / `whatsapp_credentials` de `bot-invitations`.

WhatsApp Connect **no se borra**: se comenta el montaje de rutas y la UI de QR para deprecarlo. El borrado queda para un PR posterior.

Referencia de implementación: `C:\Users\javie\Documents\Repos\bot-invitations`  
Plan: `docs/superpowers/plans/2026-09-21-meta-whatsapp-cloud-api.md`

## Decisión de diseño (enfoque B)

| Opción | Qué implica | Decisión |
|---|---|---|
| A — Copiar invitations 1:1 | Tablas extra + wizard de plantillas HSM | No |
| **B — Cloud API en el modelo actual** | Embedded Signup + Graph; persistencia como Instagram | **Sí** |
| C — Dual-run WC + Meta | Dos proveedores vivos en UI | No |

Fuera de fase 1: wizard de plantillas, campañas masivas, tablas duales de invitations.

---

## 1. Cuenta y app Meta

- [ ] Meta App con producto WhatsApp (puede ser la misma app que ya usa Instagram en este repo)
- [ ] App ID y App Secret (`META_APP_ID`; `META_APP_SECRET` ya existe para webhooks de Instagram)
- [ ] Embedded Signup Configuration ID (`META_EMBEDDED_SIGNUP_CONFIG_ID`) en Meta Developer → WhatsApp → Embedded Signup
- [ ] Feature type `whatsapp_business_app_onboarding` (coexistencia Cloud API + WhatsApp Business App)
- [ ] Facebook Login for Business habilitado; `FB.login` con `config_id` y `response_type=code`
- [ ] Dominios del frontend (y redirect) agregados en la app Meta
- [ ] Permisos: `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management`
- [ ] Advanced Access / App Review si usuarios reales no son testers de la app
- [ ] Business Manager de la plataforma (`META_BUSINESS_ID`) para OBO (vincular WABA del cliente; best-effort)
- [ ] System user + token de plataforma (`META_ACCESS_TOKEN`; `META_SYSTEM_USER_ID` opcional)
- [ ] Verify token del webhook (`META_WEBHOOK_VERIFY_TOKEN`; ya se usa en Instagram)
- [ ] Callback público HTTPS: `{API_PUBLIC_URL}/api/webhooks/meta/whatsapp`
- [ ] Suscripción webhook a los campos `messages` y `message_template_status_update`
- [ ] Graph API version alineada con Instagram (`META_GRAPH_API_VERSION`, default `v21.0`)

## 2. Variables de entorno (backend)

Ya existen para Instagram:

- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_GRAPH_API_VERSION`
- `META_WEBHOOK_ENABLED`

Agregar:

```
META_APP_ID=
META_EMBEDDED_SIGNUP_CONFIG_ID=
META_BUSINESS_ID=
META_SYSTEM_USER_ID=
META_ACCESS_TOKEN=
META_TIMEOUT_MS=8000
META_MEDIA_TIMEOUT_MS=60000
META_TEMPLATE_LANGUAGE=es_MX
```

Notas:

- `META_ACCESS_TOKEN` es el token de **nuestra** plataforma (OBO), no el del dealer. El token del cliente sale de Embedded Signup y se cifra en `channel_credentials`.
- `META_TEMPLATE_LANGUAGE` (default `es_MX`) es el idioma Graph de la plantilla HSM de seguimiento.
- El frontend **no** lleva App ID en `.env`: lo obtiene de `GET /api/integrations/whatsapp/meta/config`.
- No borrar `WC_*` mientras el código de WhatsApp Connect siga en el repo.

## 3. Modelo de datos

Usar las tablas que ya existen. **No** crear `whatsapp_integrations` ni `whatsapp_credentials`.

### `channel_integrations`

Columnas nuevas (espejo de invitations, snake_case en MySQL):

| Columna | Tipo | Uso |
|---|---|---|
| `waba_id` | `STRING(40)` nullable | WhatsApp Business Account |
| `phone_number_id` | `STRING(40)` nullable | Ruteo del webhook (índice) |
| `display_phone_number` | `STRING(40)` nullable | Número visible en Perfil |
| `coexistence_enabled` | `BOOLEAN` not null default false | Cloud + WhatsApp Business App |

Índice en `phone_number_id`. Unique existente se mantiene: `(owner_user_id, channel, provider)`.

Fila objetivo por dealer:

- `channel = "whatsapp"`
- `provider = "meta"`
- `status = "active"` tras Embedded Signup

### `channel_credentials`

Payload cifrado (`json_secrets`), igual que Instagram:

```json
{
  "accessToken": "<user token intercambiado>",
  "wabaId": "...",
  "phoneNumberId": "...",
  "displayPhoneNumber": "+52 ...",
  "businessId": "...",
  "coexistenceEnabled": true
}
```

Regla: un `phoneNumberId` no puede estar activo en otro `ownerUserId`.

### `channel_conversation_contexts`

`device_id` hoy es `NOT NULL` y en WC guarda el device. En Cloud API, convención igual que Instagram (Page ID en `device_id`): guardar `phoneNumberId`. No hace falta migración de nullability en fase 1.

### Identidad del usuario externo

Cloud API manda dígitos (`5215512345678`). WhatsApp Connect manda JID (`5215512345678@s.whatsapp.net`). Las conversaciones WC **no se reanudan solas** al cambiar de proveedor. Documentar el corte; no hay job de migración en fase 1.

## 4. Backend a implementar

Portar lógica de invitations, adaptada a `ApiError`, `env.js` y el pipeline de este repo.

| Pieza | Rol | Referencia invitations |
|---|---|---|
| `metaGraphClient.js` | HTTP Graph, exchange code, subscribe WABA, list phones, OBO | `meta-graph.client.js` |
| `metaError.js` | Mensajes de error Graph | `utils/meta-error.js` |
| `metaSignupService.js` | Completar signup + disconnect | `meta-signup.service.js` |
| `metaWhatsappClient.js` | Send text / image / document + retry | `meta.client.js` (subset, sin plantillas) |
| `whatsappCloudEventNormalizer.js` | Payload Meta → evento canónico | `normalizeMetaInboundMessage` |
| `whatsappCloudWebhookIngestionService.js` | Dedupe, CRM, bot, outbound | `wcWebhookIngestionService.js` |
| Resolver `provider=meta` por `phoneNumberId` | Ruteo webhook | `resolveMetaWhatsappByPhoneNumberId` |

Rutas autenticadas (JWT usuario):

- `GET  /api/integrations/whatsapp/meta/config`
- `POST /api/integrations/whatsapp/meta/signup`
- `POST /api/integrations/whatsapp/meta/disconnect`
- `GET  /api/integrations/whatsapp/meta/templates/followup`
- `POST /api/integrations/whatsapp/meta/templates/followup` — body `{ body }`
- `PUT  /api/integrations/whatsapp/meta/templates/followup` — body `{ body }`
- `GET  /api/internal/whatsapp/meta/status`
- `POST /api/internal/whatsapp/send-test` — implementación Meta; el handler WC se deja en archivo pero su ruta se comenta

Rutas públicas:

- `GET  /api/webhooks/meta/whatsapp` — challenge (`hub.mode` / `hub.verify_token` / `hub.challenge`)
- `POST /api/webhooks/meta/whatsapp` — firma `X-Hub-Signature-256` con `META_APP_SECRET`

No mezclar este POST con `/api/webhooks/meta/instagram` (`object` distinto).

## 5. Frontend (Perfil)

- Copiar `front/src/lib/meta-embedded-signup.ts` de invitations (SDK + `postMessage` + `FB.login`)
- Botón **Conectar WhatsApp** / **Desconectar**
- Default de alta: `channel=whatsapp`, `provider=meta`
- Ocultar / comentar QR, device status y credenciales `deviceId` + `webhookSecret`
- Send-test contra el número Cloud API
- El access token **nunca** se pega ni se muestra en el cliente
- Helmet/CSP: permitir script `https://connect.facebook.net` si el SDK queda bloqueado

## 6. Producto Cloud API (no existe en WC)

- **Ventana de 24 h:** texto, imagen y PDF de sesión solo si el usuario escribió hace menos de 24 h
- **Plantilla HSM de seguimiento:** plantilla **MARKETING** solo texto (BODY, sin HEADER/FOOTER/BUTTONS ni variables). Se crea por defecto al Embedded Signup (best-effort) y se gestiona en Comportamiento del bot. Fuera de 24 h, `botReminderService` la envía si está `APPROVED`. Spec: `docs/superpowers/specs/2026-09-22-whatsapp-followup-template-design.md`. Plan: `docs/superpowers/plans/2026-09-22-whatsapp-followup-template.md`.
- Quality rating / throughput del número en Meta
- Coexistencia: el dealer puede seguir usando WhatsApp Business App en el mismo número

## 7. Qué no copiar de invitations

- Wizard de plantillas, campañas y headers (`whatsapp-templates` completo, header handles, slots)
- Tablas `whatsapp_integrations` / `whatsapp_credentials`
- Worker de campañas, throttle masivo, documentos de apertura
- Persistencia duplicada del token en dos tablas

**Sí se copia** el subconjunto de plantillas de seguimiento: create/update Graph, webhook de status (`message_template_status_update`), badge y modal de reenvío a revisión.

## 8. Deprecación de WhatsApp Connect (comentar, no borrar)

Comentar el montaje, no eliminar archivos:

- `backend/src/routes/apiRoutes.js` — `whatsappConnectRoutes` y `whatsappConnectWebhookRoutes`
- UI QR / deviceId / webhookSecret en `frontend/src/pages/Perfil.tsx`
- Métodos WC en `frontend/src/services/integrations.ts` (dejarlos comentados o sin llamadas)
- Aviso en `README.md` y `docs/whatsapp-connect-e2e-integration.md`

Dejar intactos: `wcClient.js`, `wcAuthCache.js`, `wcWebhookIngestionService.js`, tests WC, variables `WC_*`.

## 9. Criterios de listo (fase 1)

- Un dealer completa Embedded Signup y queda `provider=meta` + `status=active`
- Un mensaje inbound llega al webhook, abre (o reanuda) conversación y el bot responde por Graph
- Imagen y PDF del catálogo se envían como `image` / `document` de Cloud API
- Send-test desde Perfil funciona dentro de 24 h
- Disconnect desuscribe el WABA (best-effort) y desactiva credenciales
- La UI de QR de WhatsApp Connect ya no está en el flujo principal
- Instagram Meta sigue funcionando (misma app secret / verify token, ruta distinta)
