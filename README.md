# Car Advisor Bot - Full Stack

Proyecto integrado con:
- `frontend/` React + Vite
- `backend/` Node.js + Express + Sequelize + JWT
- `bot/` FastAPI (servicio conversacional) integrado al backend via token de servicio

## Arquitectura

- El `backend` es la fuente unica de verdad para CRM, inventario, FAQs, promociones y KPIs.
- El `frontend` consume solo endpoints del backend.
- El `bot` mantiene `/chat`, pero reporta eventos de conversacion al backend con token permanente revocable.
- Aislamiento estricto por usuario: cada cuenta solo ve sus propios datos.

## Variables de entorno

### Backend (`backend/.env`)

Usa como base `backend/.env.example`:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `JWT_SECRET`, `JWT_EXPIRES_IN`
- `PORT`, `API_PREFIX`, `CORS_ORIGIN`
- `WC_API_URL`, `WC_EMAIL`, `WC_PASSWORD`, `WC_DEVICE_ID` (integracion WhatsApp Connect por proxy backend)
- `WC_JWT_REFRESH_MARGIN_SECONDS` (opcional, default `300`)
- `WC_TIMEOUT_MS` (opcional, default `8000`)

### Frontend (`frontend/.env`)

Usa `frontend/.env.example`:

- `VITE_API_BASE_URL=http://localhost:4000/api`

### Bot (`bot/.env`)

Usa `bot/.env.example`:

- DB y OpenAI como antes
- `BACKEND_API_URL=http://localhost:4000/api`
- `BACKEND_SERVICE_TOKEN=<token_permanente_generado_en_backend>`

## Puesta en marcha

1. Backend
   - `cd backend`
   - `npm install`
   - `npm run dev`

2. Frontend
   - `cd frontend`
   - `npm install`
   - `npm run dev`

3. Bot
   - Configurar entorno Python e instalar `requirements.txt`
   - Ejecutar FastAPI del bot como normalmente lo hacias

4. Mobile (Ionic + Capacitor wrapper)
   - `cd mobile`
   - `npm install`
   - `npm run sync` (hace build de `frontend`, copia a `mobile/www` y ejecuta `cap sync`)
   - Requisito Android: usar Gradle JDK 21+ (si falla con `invalid source release: 21`, cambia `JAVA_HOME` o el Gradle JDK de Android Studio)
   - Android: `npm run android`
   - iOS: `npm run ios`

## Flujo web -> app mobile

- La UI sigue viviendo en `frontend/` (React + Vite).
- `mobile/` no reimplementa pantallas; solo embebe el resultado de `frontend/dist` en WebView nativa.
- El script `mobile/scripts/sync-web.mjs` limpia y sincroniza `frontend/dist` hacia `mobile/www`.
- Capacitor carga `mobile/www` mediante `mobile/capacitor.config.ts` (`webDir: "www"`).

## Flujo de autenticacion

1. Registro/login de usuario:
   - `POST /api/auth/register`
   - `POST /api/auth/login`

2. Token de servicio (bot):
   - `POST /api/auth/service-tokens` con JWT de usuario
   - guardar token plano devuelto en `BACKEND_SERVICE_TOKEN`
   - revocar con `POST /api/auth/service-tokens/:id/revoke`

## Endpoints principales

- Auth: `/api/auth/*`
- Dashboard: `GET /api/dashboard/kpis`
- Clientes: `/api/clients`
- Conversaciones: `/api/conversations`, `/api/conversations/:id/messages`
- Vehiculos: `/api/vehicles`
- FAQs: `/api/faqs`
- Promociones: `/api/promotions`
- Bot integration: `POST /api/bot/conversation-events`
- WhatsApp QR link (interno): `POST /api/internal/whatsapp/qr-link` (requiere JWT de usuario)

## Flujo WhatsApp Connect (proxy backend)

1. El usuario crea una integracion de canal `whatsapp` con proveedor `whatsapp-connect` en `Perfil`.
2. El frontend llama `POST /api/internal/whatsapp/qr-link`.
3. El backend hace login con `WC_EMAIL/WC_PASSWORD`, cachea el JWT, ejecuta:
   - `POST /auth/login`
   - `POST /devices/:id/connect`
   - `POST /devices/:id/public-link`
4. El backend responde `{ url, expiresAt }` y el frontend abre el QR en una nueva pestana.

Notas de seguridad:
- El JWT de WhatsApp Connect y las credenciales de servicio nunca se exponen al frontend.
- El backend reintenta una vez si recibe `401` del proveedor (re-login + retry).

## Notas de migracion

- Se agrego `backend/src/migrations` y `backend/src/seeders`.
- El backend usa Sequelize con `sequelize.sync()` al iniciar para alinear tablas en entornos de desarrollo.
- El bot conserva fallback a MySQL local aunque ahora puede reportar eventos al backend Node.

## Despliegue backend en Easy Panel (Docker Compose)

Este repositorio incluye un `docker-compose.yml` para levantar solo el backend:

- Servicio: `backend`
- Build: `./backend/Dockerfile`
- Base de datos: MySQL externo (no incluido en el compose)

### Variables minimas requeridas en Easy Panel

- `DB_HOST`
- `DB_PORT` (normalmente `3306`)
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `JWT_SECRET`
- `CORS_ORIGIN` (ej: `https://tu-frontend.com`)

Tambien puedes definir (opcionales): `PORT`, `API_PREFIX`, `JWT_EXPIRES_IN`, `BOT_ENGINE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

### Pasos en Easy Panel

1. Crear una app usando este repositorio.
2. Seleccionar `docker-compose.yml` en la raiz del proyecto.
3. Cargar las variables de entorno requeridas.
4. Exponer/publicar el puerto del servicio (`PORT`, por defecto `4000`).
5. Desplegar.

### Prueba rapida

- Healthcheck manual: `GET /health`.
