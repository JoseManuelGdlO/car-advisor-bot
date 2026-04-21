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

## Notas de migracion

- Se agrego `backend/src/migrations` y `backend/src/seeders`.
- El backend usa Sequelize con `sequelize.sync()` al iniciar para alinear tablas en entornos de desarrollo.
- El bot conserva fallback a MySQL local aunque ahora puede reportar eventos al backend Node.
