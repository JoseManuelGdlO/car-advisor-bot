"""Helpers de estado conversacional reutilizables."""

from __future__ import annotations

import json
from typing import Any

from src.state import clientState


def latest_user_message(state: clientState) -> str:
    """Obtiene el ultimo mensaje de usuario del historial."""

    for message in reversed(state.get("messages", [])):
        if message.get("role") == "user":
            return str(message.get("content", "")).strip()
    return ""


def latest_human_ai_pair(state: clientState) -> tuple[str, str]:
    """Obtiene el ultimo par relevante (Human -> AI) del historial operativo."""

    last_user = ""
    last_ai = ""
    for message in reversed(state.get("messages", [])):
        role = message.get("role")
        if role == "assistant" and not last_ai:
            last_ai = str(message.get("content", "")).strip()
        elif role == "user" and not last_user:
            last_user = str(message.get("content", "")).strip()
        if last_user and last_ai:
            break
    return last_user, last_ai


def append_assistant_message(state: clientState, text: str, options: list[str]) -> clientState:
    """Agrega respuesta al historial y actualiza campos de salida API."""

    messages = list(state.get("messages", []))
    messages.append({"role": "assistant", "content": text, "options": options, "type": "AIMessage"})
    state["messages"] = messages
    state["last_bot_message"] = text
    state["options"] = options
    return state


def is_faq_intent(text: str) -> bool:
    """Detector determinista de intencion FAQ/interrupcion."""

    normalized = text.strip().lower()
    faq_terms = [
        "faq",
        "pregunta",
        "informacion",
        "info",
        "horario",
        "financiamiento",
        "garantia",
        "ubicacion",
    ]
    return any(term in normalized for term in faq_terms)


def parse_customer_info(raw_text: str) -> dict[str, Any]:
    """Parsea datos de cliente en formato 'nombre:..., telefono:..., email:...'."""

    info: dict[str, Any] = {}
    if not raw_text:
        return info

    try:
        parsed = json.loads(raw_text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    for token in raw_text.split(","):
        if ":" not in token:
            continue
        key, value = token.split(":", 1)
        key_norm = key.strip().lower()
        value_norm = value.strip()
        if key_norm and value_norm:
            info[key_norm] = value_norm
    return info
