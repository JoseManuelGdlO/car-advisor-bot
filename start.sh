#!/bin/bash

# Matar todos los procesos hijos al salir (Ctrl+C)
trap "kill 0" EXIT

echo "🚀 Arrancando motores desde la raíz..."

# 1. Backend (Puerto 4000)
(cd backend && npm start) &

# 2. Frontend (Puerto 3000)
(cd frontend && npm run dev) &

# 3. Bot Engine
# Nota: Según tu imagen, .venv está en la raíz, así que subimos un nivel para alcanzarlo
(cd bot && ../.venv/bin/python3 -m src.server) &

# 4. Chat UI (Puerto 8090)
(cd bot/chat && python3 -m http.server 8090) &

# Mantener el script vivo para ver los logs
wait