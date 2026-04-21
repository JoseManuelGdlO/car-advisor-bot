# App móvil (Capacitor)

La UI es el mismo build de `frontend` copiado a `www` (ver `scripts/sync-web.mjs`).

## API desde el teléfono

1. En `frontend/.env` (o `.env.production`), define `VITE_API_BASE_URL` apuntando a una URL que el dispositivo pueda alcanzar (IP de tu PC en la LAN, túnel ngrok, o dominio).
2. `npm run build` en `frontend`.
3. `npm run sync` en `mobile` para copiar `dist` y actualizar proyectos nativos.

`localhost` en el móvil **no** es tu PC; usa IP o dominio público.
