#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_DIR="$ROOT_DIR/scripts/suzuki_pdf_import/.venv"
INPUT_DIR="${SUZUKI_PDF_INPUT:-/Users/intelekia/Downloads/suzuki_cars}"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
  esac
done

if [[ ! -d "$VENV_DIR" ]]; then
  echo "Creando entorno virtual en $VENV_DIR..."
  python3 -m venv "$VENV_DIR"
fi

echo "Instalando dependencias Python..."
"$VENV_DIR/bin/pip" install -q -r "$ROOT_DIR/scripts/suzuki_pdf_import/requirements.txt"

echo "Extrayendo datos de PDFs..."
"$VENV_DIR/bin/python" "$ROOT_DIR/scripts/suzuki_pdf_import/extract.py" \
  --input "$INPUT_DIR" \
  --images-dir "$ROOT_DIR/backend/autobot" \
  --manifest "$ROOT_DIR/backend/scripts/.suzuki-import/manifest.json"

echo "Importando vehículos..."
cd "$ROOT_DIR/backend"
if [[ "$DRY_RUN" -eq 1 ]]; then
  node scripts/import-suzuki-vehicles.mjs --dry-run
else
  node scripts/import-suzuki-vehicles.mjs
fi
