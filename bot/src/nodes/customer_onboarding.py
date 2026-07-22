"""Nodo de bienvenida inicial: envia welcomeMessage una vez y cede el flujo."""

from __future__ import annotations

from typing import Any

from src.state import clientState
from src.tools.database import get_bot_settings
from src.utils.app_logging import get_app_logger, log_flow_trace
from src.utils.state_helpers import append_assistant_message

_log = get_app_logger("customer_onboarding")


def _debug(event: str, **payload: Any) -> None:
    log_flow_trace(_log, "customer_onboarding", event, **payload)


def _welcome_message_from_settings() -> str:
    """Texto literal de welcomeMessage; fallback minimo si el setting esta vacio."""

    settings = get_bot_settings()
    welcome = str(settings.get("welcomeMessage") or "").strip()
    if welcome:
        return welcome
    bot_name = str(settings.get("botName") or "").strip() or "CarAdvisor"
    return f"Hola, soy {bot_name}. Estoy aqui para ayudarte."


def customer_onboarding(state: clientState) -> clientState:
    """Si no se ha enviado la bienvenida, la manda literal y continua a intent_checker."""

    if state.get("onboarding_greeting_done"):
        _debug("passthrough_greeting_done")
        return state

    welcome = _welcome_message_from_settings()
    state = append_assistant_message(state, welcome)
    state["onboarding_greeting_done"] = True
    state["onboarding_welcome_sent_this_turn"] = True
    _debug("welcome_sent", welcome=welcome[:200])
    return state
