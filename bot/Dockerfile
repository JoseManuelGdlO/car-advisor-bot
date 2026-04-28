# Imagen de producción: servicio FastAPI del bot (POST /chat para BOT_ENGINE_URL / WhatsApp Connect).
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    API_HOST=0.0.0.0 \
    API_PORT=8000

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Si el orquestador inyecta PORT (p. ej. EasyPanel), prevalece sobre API_PORT.
CMD ["sh", "-c", "exec python -m uvicorn src.server:app --host \"${API_HOST:-0.0.0.0}\" --port \"${PORT:-${API_PORT:-8000}}\""]
