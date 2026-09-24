# Progreso: WhatsApp Cloud API (enfoque B)

Plan: `docs/superpowers/plans/2026-09-21-meta-whatsapp-cloud-api.md`  
Requisitos: `docs/meta-cloud-api-requisitos.md`  
Rama: `refactor/meta-api`  
Inicio: 2026-09-21  
BASE inicial: `9446dd7`  
HEAD: `eb3d380`

## Estado general

| Task | Título | Status | Commits | Review |
|------|--------|--------|---------|--------|
| 1 | Env, columnas Meta y cliente Graph | complete | `9446dd7..1a189cd` | clean (Approved) |
| 2 | Embedded Signup, disconnect y resolver | complete | `1a189cd..84dbd46` | clean after fix (Approved) |
| 3 | Webhook inbound Cloud API | complete | `84dbd46..f4d1adf` | clean (Approved) |
| 4 | Outbound Graph | complete | `f4d1adf..21a7ab6` | clean after fix (Approved) |
| 5 | Frontend Embedded Signup y UI | complete | `21a7ab6..1f3dfd5` | clean (Approved) |
| 6 | Comentar WhatsApp Connect | complete | `1f3dfd5..1d1d36e` | clean (Approved) |
| 7 | Verificación E2E (local) | complete* | sin commit | informe honesto; E2E Meta MANUAL |
| Final | Review contrastado con el plan | complete | `eb3d380` follow-ups | Important corregidos; 409 receipts plan-mandated |

\* Task 7 no cierra el E2E contra Meta Developer. Cierra lo automatizable/local.

## AVISO — Challenge Meta (listo para registrar)

**Los archivos del webhook Cloud API están en la rama** (desde Task 3, commit `f4d1adf`). Puedes configurar el callback en Meta Developer **en paralelo**.

- **Callback URL:** `{API_PUBLIC_URL}/api/webhooks/meta/whatsapp`  
  Ejemplo local (túnel HTTPS): `https://<tu-host>/api/webhooks/meta/whatsapp`
- **Verify token:** `META_WEBHOOK_VERIFY_TOKEN` en `backend/.env` (el mismo que Instagram)
- **GET challenge local:** **PASS** — 200 con el `hub.challenge` si el token coincide; 403 si no. Instagram `/api/webhooks/meta/instagram` sigue vivo (200/403).
- **Campo a suscribir:** `messages`
- **Firma POST:** `META_APP_SECRET` — en el `.env` local está **vacío**. El GET challenge funciona; el POST de Meta fallará la firma hasta que pongas el secret y reinicies el backend.
- **También vacíos / comentados:** `META_APP_ID`, `META_EMBEDDED_SIGNUP_CONFIG_ID` (necesarios para Embedded Signup).
- **Migración:** `202609211200-whatsapp-meta-columns` **ya aplicada** en el MySQL local.

Datos para ir sacando de Meta:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_EMBEDDED_SIGNUP_CONFIG_ID`
- `META_BUSINESS_ID` (OBO, best-effort)
- `META_ACCESS_TOKEN` o `META_SYSTEM_USER_TOKEN` (token de **plataforma**, no el del dealer)
- Permisos: `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management`

## Commits (9)

```
1a189cd feat: add Meta Graph client and WABA columns
f8007fd feat: add WhatsApp Embedded Signup
84dbd46 fix: validate WABA before OAuth exchange
f4d1adf feat: ingest WhatsApp Cloud API webhooks
94255fc feat: send WhatsApp via Cloud API
21a7ab6 fix: stamp lastReminderAt on 24h Graph errors
1f3dfd5 feat: WhatsApp Embedded Signup in profile
1d1d36e chore: deprecate WhatsApp Connect routes
eb3d380 fix: Cloud API review follow-ups
```

## Tests (verificado al cierre)

- Backend: **218 pass / 0 fail** (`$env:NODE_ENV='test'; node --test "src/**/*.test.js"`)
- Frontend: **24 pass / 0 fail** (`npm test`)
- `npm test` en cmd de Windows sigue fallando por `NODE_ENV=test` (preexistente)

## Hallazgos y decisiones

### Task 1
- [Task 1 Graph client](72d79a65-57a3-4bb8-810d-97fe55704e59) → [Review](2eed4ae2-549e-4ac4-b8b8-32406d4b007d) Approved
- Minor: `subcode` fallback `error_user_title` (plan-mandated); timeouts `Number()` pueden ser NaN

### Task 2
- [Signup](b2cb5f13-1156-4c38-80a1-782dbfc1f6a1) → [Review](d3eb6c60-a7c6-4114-b910-2fbf7c9a8928) Needs fixes → [Fix](770af26c-35d4-47b5-8b93-bd77843ae9ef) `84dbd46` → [Re-review](0434a3b8-b198-4e19-a37a-50b9d852e2f4) Approved
- WABA se valida **antes** de gastar el code OAuth
- Minor: `metaWhatsappRoutes.js` duplicado no montado; `configured` en status = credencial activa

### Task 3 (webhook / challenge)
- [Webhook](fd08514a-f032-4a88-b583-2d6101051e9d) → [Review](d26d5420-5fdd-4b27-ba58-5a2f489c8b99) Approved
- Outbound diferido cerrado en Task 4
- **Plan-mandated (no tocado):** receipt `failed` + 409 duplicate tragado como Instagram

### Task 4
- [Outbound](db4f8d5b-526f-4b22-88d6-84d785f20205) → [Review](0c0829c3-3266-4af2-95cf-4f122b751b77) Needs fixes → [Fix](9e720ad5-9ffc-46b1-8454-d8ed84018fb4) `21a7ab6` → [Re-review](88da7bff-eaa1-459a-b120-735a0cc99a57) Approved
- 24 h Graph en recordatorios sella `lastReminderAt` para no martillar el poller
- Send-test WC desmontado en Task 6

### Task 5
- [UI](32a8c920-52a6-4f28-8456-45ce26147814) → [Review](2114ac7e-d6e1-446c-b86f-308f8de57d78) Approved
- Perfil requiere login: no se pudo verificar en navegador (queda en checklist humano)
- Helmet/CSP no tocado (SPA Vite; no aplica la contingencia Express)

### Task 6
- [Deprecar WC](647b673a-d925-4ead-bbae-18e28e80e6a8) → [Review](11cd43e8-e38f-4790-afbd-9e1a3f5ab69c) Approved
- Rutas WC desmontadas; archivos conservados con `DEPRECATED`

### Task 7
- [E2E local](298d27d0-00ff-4626-952c-ed69c1735059) → [Review informe](64797bd2-df33-4ef5-9f3b-334d0d18c4d2) calidad Approved; puerta Meta abierta
- GET challenge PASS; env Meta incompleto

### Review final
- [Whole-branch](9087c4dd-97ec-428f-9f55-bdaf596d9a87) Ready to merge **With fixes**
- [Fix round](40992ba9-ab91-4517-ad52-4589da0390db) `eb3d380` → [Re-review](57f2f56f-1244-40e2-b2c2-cad8d3579bb4) Approved
- Correcciones: Graph `to` internacional; SDK no cuelga; menú Credenciales oculto en WhatsApp Meta/WC; exclusividad también por ciphertext; tests de ingest; `tokenPreview` solo con `debugGraphToken`
- **No corregido (plan Instagram):** retry Meta sobre receipt `failed` sigue 409 duplicate
- **Sin unique index** en `phone_number_id` (riesgo de carrera concurrente)

## Checklist humano restante (Meta real)

1. Completar y descomentar en `backend/.env`: `META_APP_ID`, `META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID`. Reiniciar backend.
2. Embedded Signup desde Perfil con número tester.
3. BD: `channel_integrations` `whatsapp`/`meta`/`active` + credencial activa (token no visible en frontend).
4. Meta Developer: callback HTTPS + verify token + suscribir `messages`.
5. Texto al número → Conversaciones → bot responde. Probar imagen y PDF.
6. Send-test a un número con ventana &lt; 24 h.
7. Disconnect → `disabled`; reconnect.
8. Perfil logueado: no UI de QR WhatsApp Connect.
9. Recordatorio &lt; 24 h se envía; fuera de ventana el poller no crashea.

## Workflow usado

- Subagent-driven: implementador + review por task; fix si Critical/Important; review final vs plan; un commit de follow-ups.
- Modelos: Composer y Grok de Cursor (sin modelos externos).
- Workspace: checkout `refactor/meta-api` (no main).

*Fase plantillas: `docs/superpowers/plans/2026-09-22-whatsapp-followup-template.md`.*
