"""Logging de aplicacion: nivel visible y trazas de flujo alineadas con LOG_LEVEL."""

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
    """Configura el logger `car_advisor` con nivel y mensaje a stderr."""

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
    handler.setFormatter(logging.Formatter("%(levelname)s | %(message)s"))
    root.addHandler(handler)


def get_app_logger(suffix: str) -> logging.Logger:
    """Logger hijo bajo `car_advisor.<suffix>` (p.ej. graph, router)."""

    return logging.getLogger(f"{_APP_LOG_ROOT}.{suffix}")


def log_flow_trace(logger: logging.Logger, tag: str, event: str, **payload: object) -> None:
    """Trazas de flujo: en INFO solo `[tag] evento`; el payload completo solo en DEBUG."""

    if not payload:
        logger.info(f"[{tag}] {event}")
        return
    pairs = ", ".join(f"{key}={value!r}" for key, value in payload.items())
    if logger.isEnabledFor(logging.DEBUG):
        logger.debug(f"[{tag}] {event} | {pairs}")
    else:
        logger.info(f"[{tag}] {event}")
