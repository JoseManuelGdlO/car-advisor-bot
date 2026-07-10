"""Nodo de bienvenida y captura del nombre del cliente."""

from __future__ import annotations

from typing import Any

from src.services.llm_responses import (
    classify_onboarding_first_message,
    extract_customer_name,
    generate_welcome_and_name_request,
    generate_welcome_with_known_name,
)
from src.state import clientState
from src.tools.database import sync_customer_info_to_backend
from src.utils.app_logging import get_app_logger, log_flow_trace
from src.utils.state_helpers import append_assistant_message, latest_user_message

_log = get_app_logger("customer_onboarding")

_GENERIC_CLIENT_NAMES = frozenset({"cliente", "client", ""})


def _debug(event: str, **payload: Any) -> None:
    log_flow_trace(_log, "customer_onboarding", event, **payload)


def _is_real_customer_name(name: str) -> bool:
    cleaned = str(name or "").strip()
    return len(cleaned) >= 2 and cleaned.lower() not in _GENERIC_CLIENT_NAMES


def _customer_name_from_state(state: clientState) -> str:
    info = state.get("customer_info")
    if not isinstance(info, dict):
        return ""
    nombre = str(info.get("nombre", "")).strip()
    if _is_real_customer_name(nombre):
        return nombre
    return ""


def _is_first_user_turn(state: clientState) -> bool:
    messages = state.get("messages", [])
    if not isinstance(messages, list):
        return False
    user_count = sum(1 for message in messages if message.get("role") == "user")
    assistant_count = sum(1 for message in messages if message.get("role") == "assistant")
    return user_count == 1 and assistant_count == 0


def _sync_customer_name(state: clientState, nombre: str) -> None:
    user_id = str(state.get("user_id", "")).strip()
    platform = str(state.get("platform", "web")).strip() or "web"
    if not user_id or not nombre:
        return
    sync_customer_info_to_backend(
        user_id,
        {"nombre": nombre},
        platform=platform,
        owner_user_id=str(state.get("owner_user_id", "")).strip() or None,
    )


def _proceed_without_name(state: clientState, *, reason: str = "name_not_provided") -> clientState:
    """Cierra captura de nombre sin persistir uno; reanuda intencion pendiente si existia."""

    state["awaiting_customer_name"] = False
    state["onboarding_greeting_done"] = True
    pending = str(state.get("pending_onboarding_user_message", "")).strip()
    state["pending_onboarding_user_message"] = ""
    if pending:
        state["onboarding_resume_user_message"] = pending
        state["onboarding_turn_complete"] = False
        _debug(f"{reason}_resume_pending", pending=pending)
        return append_assistant_message(state, "Entendido. Con gusto te ayudo.")
    state["onboarding_turn_complete"] = True
    _debug(reason)
    return append_assistant_message(state, "Entendido. ¿En qué te puedo ayudar hoy?")


def _resume_pending_flow(
    state: clientState,
    nombre: str,
    *,
    message_remainder: str = "",
) -> clientState:
    """Tras capturar nombre, reanuda la intencion pendiente o la peticion del mismo mensaje."""

    pending = str(state.get("pending_onboarding_user_message", "")).strip()
    state["pending_onboarding_user_message"] = ""
    resume_text = pending
    if not resume_text:
        remainder = str(message_remainder or "").strip()
        if remainder:
            onboarding_flags = classify_onboarding_first_message(remainder)
            if onboarding_flags.get("tiene_intencion_comercial"):
                resume_text = remainder
                _debug(
                    "resume_from_name_capture_remainder",
                    remainder=remainder,
                    onboarding_flags=onboarding_flags,
                )
    if resume_text:
        state["onboarding_resume_user_message"] = resume_text
        state["onboarding_turn_complete"] = False
        _debug("resume_pending_flow", pending=resume_text, nombre=nombre)
        return append_assistant_message(state, f"Mucho gusto, {nombre}.")
    state["onboarding_turn_complete"] = True
    return append_assistant_message(
        state,
        f"Mucho gusto, {nombre}. ¿En qué te puedo ayudar hoy?",
    )


def customer_onboarding(state: clientState) -> clientState:
    """Bienvenida inicial y captura de nombre antes del flujo comercial."""

    saved_node = str(state.get("current_node", "start")).strip()
    state["onboarding_turn_complete"] = False

    user_text = latest_user_message(state)
    customer_name = _customer_name_from_state(state)
    _debug(
        "entry",
        user_text=user_text,
        customer_name=customer_name,
        awaiting_customer_name=bool(state.get("awaiting_customer_name")),
        onboarding_greeting_done=bool(state.get("onboarding_greeting_done")),
        pending_onboarding_user_message=str(state.get("pending_onboarding_user_message", "")),
    )

    if state.get("awaiting_customer_name"):
        state["current_node"] = "customer_onboarding"
        previous_bot = str(state.get("last_bot_message", "")).strip()
        extracted = extract_customer_name(previous_bot, user_text)
        nombre = str(extracted.get("nombre") or "").strip()
        if nombre and _is_real_customer_name(nombre):
            info = dict(state.get("customer_info") or {})
            info["nombre"] = nombre
            state["customer_info"] = info
            state["awaiting_customer_name"] = False
            state["onboarding_greeting_done"] = True
            _sync_customer_name(state, nombre)
            _debug("name_captured", nombre=nombre)
            return _resume_pending_flow(
                state,
                nombre,
                message_remainder=str(extracted.get("mensaje_restante") or "").strip(),
            )

        reason = "name_refused" if extracted.get("is_refusal") else "name_not_extracted"
        return _proceed_without_name(state, reason=reason)

    if customer_name and state.get("onboarding_greeting_done"):
        if saved_node not in {"", "start"}:
            state["current_node"] = saved_node
        return state

    if customer_name and _is_first_user_turn(state):
        state["current_node"] = "customer_onboarding"
        welcome = generate_welcome_with_known_name(customer_name, user_message=user_text)
        state["onboarding_greeting_done"] = True
        state = append_assistant_message(state, welcome)
        onboarding_flags = classify_onboarding_first_message(user_text)
        tiene_intencion_comercial = bool(onboarding_flags.get("tiene_intencion_comercial"))
        if not tiene_intencion_comercial:
            state["onboarding_turn_complete"] = True
            _debug("welcome_known_name_only_greeting", onboarding_flags=onboarding_flags)
        else:
            _debug("welcome_known_name_continue_flow", onboarding_flags=onboarding_flags)
        return state

    if not customer_name and _is_first_user_turn(state):
        state["current_node"] = "customer_onboarding"
        onboarding_flags = classify_onboarding_first_message(user_text)
        if onboarding_flags.get("tiene_intencion_comercial"):
            state["pending_onboarding_user_message"] = user_text
            _debug("pending_flow_intent_saved", user_text=user_text, onboarding_flags=onboarding_flags)
        welcome = generate_welcome_and_name_request(user_message=user_text)
        state["awaiting_customer_name"] = True
        state["onboarding_turn_complete"] = True
        _debug("welcome_ask_name")
        return append_assistant_message(state, welcome)

    if saved_node not in {"", "start"}:
        state["current_node"] = saved_node
    return state
