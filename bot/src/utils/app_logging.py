"""Logging de aplicacion: mensaje plano (sin prefijos ruidosos) y nivel vía LOG_LEVEL."""

from __future__ import annotations

import logging
import os
import sys

_APP_LOG_ROOT = "car_advisor"
_setup_done = False


def app_log_level() -> int:
    """Nivel numérico según LOG_LEVEL (default info)."""

    raw = (os.getenv("LOG_LEVEL") or "info").strip().lower()
    if raw == "debug":
        return logging.DEBUG
    return logging.INFO


def uvicorn_log_level_str() -> str:
    """Valor de `log_level` para uvicorn.run alineado con LOG_LEVEL."""

    return "debug" if app_log_level() == logging.DEBUG else "info"


def setup_app_logging() -> None:
    """Configura el logger `car_advisor` con salida solo %(message)s a stderr."""

    global _setup_done
    if _setup_done:
        return
    _setup_done = True
    level = app_log_level()
    root = logging.getLogger(_APP_LOG_ROOT)
    root.handlers.clear()
    root.setLevel(level)
    root.propagate = False
    handler = logging.StreamHandler(sys.stderr)
    handler.setLevel(level)
    handler.setFormatter(logging.Formatter("%(message)s"))
    root.addHandler(handler)


def get_app_logger(suffix: str) -> logging.Logger:
    """Logger hijo bajo `car_advisor.<suffix>` (p.ej. graph, router)."""

    return logging.getLogger(f"{_APP_LOG_ROOT}.{suffix}")
