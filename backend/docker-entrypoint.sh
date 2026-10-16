#!/bin/sh
set -e

# El volumen autobot-uploads monta /app/autobot y oculta los archivos de la imagen
# después del primer despliegue. Copiamos los que vienen en el repo sin sobrescribir
# uploads que ya existan en el volumen.
if [ -d /app/autobot-seed ]; then
  mkdir -p /app/autobot
  cp -an /app/autobot-seed/. /app/autobot/ || true
fi

exec "$@"
