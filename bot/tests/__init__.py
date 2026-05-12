"""
Test suite por flujo para el grafo conversacional.

Ejecutar:
    pytest tests/
o:
    python -m unittest discover -s tests -p "test_*.py"

Un solo test con unittest:
    python -m unittest tests.test_vehicle_catalog_flow

Índice y propósito de cada módulo: ver docs/tests.md (desde la raíz del paquete bot).
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import dotenv_values, load_dotenv


def _merge_dotenv(path: Path) -> None:
    """Rellena variables faltantes o vacías (p. ej. IDE con OPENAI_API_KEY='')."""

    if not path.is_file():
        return
    load_dotenv(path, override=False)
    for key, raw in dotenv_values(path).items():
        if not key:
            continue
        val = (raw or "").strip() if isinstance(raw, str) else raw
        if val is None or val == "":
            continue
        cur = os.environ.get(key)
        if cur is None or (isinstance(cur, str) and not cur.strip()):
            os.environ[key] = val if isinstance(val, str) else str(val)


# Carga temprana para pytest y para unittest (unittest no ejecuta conftest.py).
_bot_dir = Path(__file__).resolve().parent.parent
_merge_dotenv(_bot_dir / ".env")
_merge_dotenv(_bot_dir.parent / ".env")
