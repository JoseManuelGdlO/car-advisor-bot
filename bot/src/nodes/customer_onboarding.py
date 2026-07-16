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
from src.tools.vehicles import normalize_user_text
from src.utils.app_logging import get_app_logger, log_flow_trace
from src.utils.signals import (
    is_business_faq_question,
    is_greeting_only_message,
    is_simple_greeting,
    looks_like_greeting_or_generic_not_name,
)
from src.utils.state_helpers import append_assistant_message, latest_user_message

_log = get_app_logger("customer_onboarding")

_GENERIC_CLIENT_NAMES = frozenset({"cliente", "client", ""})

# Consultas comerciales que no deben interpretarse como nombre propio.
_COMMERCIAL_NOT_NAME_SUBSTR: frozenset[str] = frozenset(
    (
        "precio",
        "costo",
        "cuanto cuesta",
        "cuanto vale",
        "cotizar",
        "cotizacion",
        "cotizame",
        "presupuesto",
        "quiero ver",
        "me interesa",
        "busco",
        "modelo",
        "modelos",
        "marca",
        "marcas",
        "catalogo",
        "inventario",
        "disponible",
        "disponibles",
        "financ",
        "credito",
        "enganche",
        "mensualidad",
        "promocion",
        "oferta",
        "descuento",
        "auto",
        "autos",
        "carro",
        "carros",
        "vehiculo",
        "vehiculos",
        "camioneta",
        "suv",
        "sedan",
        "pickup",
    )
)


def _debug(event: str, **payload: Any) -> None:
    log_flow_trace(_log, "customer_onboarding", event, **payload)


def _is_real_customer_name(name: str) -> bool:
    cleaned = str(name or "").strip()
    return len(cleaned) >= 2 and cleaned.lower() not in _GENERIC_CLIENT_NAMES


def _looks_like_commercial_not_name(user_message: str) -> bool:
    """True si el mensaje parece consulta comercial/catalogo y no un nombre propio."""

    normalized = normalize_user_text(user_message)
    if not normalized:
        return False
    return any(term in normalized for term in _COMMERCIAL_NOT_NAME_SUBSTR)


def _looks_like_not_a_name(user_message: str) -> bool:
    """True si el mensaje es consulta comercial, FAQ, saludo o peticion generica, no un nombre."""

    return (
        _looks_like_commercial_not_name(user_message)
        or looks_like_greeting_or_generic_not_name(user_message)
        or is_business_faq_question(user_message)
    )


def _sanitize_name_extraction(extracted: dict[str, Any], user_message: str) -> dict[str, Any]:
    """Descarta nombres inventados a partir de consultas comerciales o FAQ."""

    nombre = str(extracted.get("nombre") or "").strip()
    remainder = str(extracted.get("mensaje_restante") or "").strip()

    if nombre and remainder and not _looks_like_not_a_name(nombre):
        return extracted

    if nombre and not _looks_like_not_a_name(nombre) and not _looks_like_not_a_name(user_message):
        return extracted

    if not _looks_like_not_a_name(user_message) and not (nombre and _looks_like_not_a_name(nombre)):
        return extracted

    out = dict(extracted)
    out["nombre"] = None
    out["is_refusal"] = True
    out["mensaje_restante"] = remainder or str(user_message or "").strip() or None
    return out


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


def _proceed_with_faq_during_name_capture(
    state: clientState,
    faq_text: str,
    *,
    reason: str,
    nombre: str = "",
) -> clientState:
    """Cierra captura de nombre ante una FAQ: reanuda comercial pendiente y difiere la FAQ."""

    state["awaiting_customer_name"] = False
    state["onboarding_greeting_done"] = True
    pending = str(state.get("pending_onboarding_user_message", "")).strip()
    state["pending_onboarding_user_message"] = ""
    state["deferred_faq_user_message"] = faq_text
    state["onboarding_turn_complete"] = False
    if pending:
        state["onboarding_resume_user_message"] = pending
        _debug(f"{reason}_defer_faq_resume_pending", pending=pending, faq_text=faq_text)
        if nombre:
            return append_assistant_message(state, f"Mucho gusto, {nombre}.")
        return append_assistant_message(state, "Entendido. Con gusto te ayudo.")
    # Sin pending comercial: contestar la FAQ en este mismo turno.
    state["current_node"] = "faq"
    state["intent"] = "faq"
    _debug(f"{reason}_faq_only", faq_text=faq_text)
    if nombre:
        return append_assistant_message(state, f"Mucho gusto, {nombre}.")
    return state


def _resume_pending_flow(
    state: clientState,
    nombre: str,
    *,
    message_remainder: str = "",
) -> clientState:
    """Tras capturar nombre, reanuda la intencion pendiente o la peticion del mismo mensaje."""

    remainder = str(message_remainder or "").strip()
    if remainder and is_business_faq_question(remainder):
        return _proceed_with_faq_during_name_capture(
            state,
            remainder,
            reason="name_captured_with_faq_remainder",
            nombre=nombre,
        )
    pending = str(state.get("pending_onboarding_user_message", "")).strip()
    state["pending_onboarding_user_message"] = ""
    resume_text = ""
    if remainder:
        remainder_flags = classify_onboarding_first_message(remainder)
        if remainder_flags.get("tiene_intencion_comercial"):
            resume_text = remainder
            _debug(
                "resume_from_name_capture_remainder",
                remainder=remainder,
                onboarding_flags=remainder_flags,
            )
    if not resume_text:
        resume_text = pending
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

    # CTWA: saltar captura de nombre y dejar continuar a car_selection.
    if state.get("ad_campaign_shortcut") and str(state.get("selected_vehicle_id") or "").strip():
        state["current_node"] = "car_selection"
        state["onboarding_greeting_done"] = True
        state["awaiting_customer_name"] = False
        state["onboarding_turn_complete"] = False
        _debug(
            "ad_campaign_shortcut_skip",
            selected_vehicle_id=str(state.get("selected_vehicle_id") or ""),
            selected_car=str(state.get("selected_car") or ""),
        )
        return state

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
        extracted = _sanitize_name_extraction(
            extract_customer_name(previous_bot, user_text),
            user_text,
        )
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
        remainder = str(extracted.get("mensaje_restante") or "").strip()
        candidate = remainder or user_text
        # FAQ durante captura de nombre: no descartarla; diferir tras reanudar pending comercial.
        if candidate and is_business_faq_question(candidate):
            return _proceed_with_faq_during_name_capture(
                state,
                candidate,
                reason=f"{reason}_with_faq",
            )
        # Si respondio con consulta comercial (o el sanitizer la marco como tal), priorizar
        # ese mensaje sobre el pendiente generico del primer turno al reanudar.
        commercial_resume = ""
        if candidate and _looks_like_commercial_not_name(candidate):
            commercial_resume = candidate
        elif extracted.get("is_refusal") and remainder:
            commercial_resume = remainder
        if commercial_resume:
            state["pending_onboarding_user_message"] = commercial_resume
            _debug("commercial_instead_of_name_resume_pending", remainder=commercial_resume)
        return _proceed_without_name(state, reason=reason)

    if customer_name and state.get("onboarding_greeting_done"):
        if is_greeting_only_message(user_text):
            # Saludo simple al inicio de sesión: el router marca intent=other sin bienvenida extra.
            if saved_node in {"", "start"} and is_simple_greeting(user_text):
                _debug("returning_customer_simple_greeting_pass_through", customer_name=customer_name)
                return state
            state["current_node"] = "customer_onboarding"
            state["onboarding_turn_complete"] = True
            _debug("returning_customer_greeting_only", customer_name=customer_name)
            return append_assistant_message(
                state,
                f"¡Hola de nuevo, {customer_name}! ¿En qué te ayudo?",
            )
        if saved_node not in {"", "start"}:
            state["current_node"] = saved_node
        return state

    if customer_name and _is_first_user_turn(state):
        state["current_node"] = "customer_onboarding"
        welcome = generate_welcome_with_known_name(customer_name, user_message=user_text)
        state["onboarding_greeting_done"] = True
        state = append_assistant_message(state, welcome)
        if is_business_faq_question(user_text):
            state["deferred_faq_user_message"] = user_text
            state["onboarding_turn_complete"] = False
            _debug("welcome_known_name_defer_faq", faq_text=user_text)
            return state
        onboarding_flags = classify_onboarding_first_message(user_text)
        tiene_intencion_comercial = bool(onboarding_flags.get("tiene_intencion_comercial"))
        if not tiene_intencion_comercial:
            state["onboarding_turn_complete"] = True
            _debug("welcome_known_name_only_greeting", onboarding_flags=onboarding_flags)
        else:
            state["onboarding_resume_user_message"] = user_text
            state["onboarding_welcome_sent_this_turn"] = True
            _debug(
                "welcome_known_name_continue_flow",
                onboarding_flags=onboarding_flags,
                resume_user_message=user_text,
            )
        return state

    if not customer_name and _is_first_user_turn(state):
        state["current_node"] = "customer_onboarding"
        onboarding_flags = classify_onboarding_first_message(user_text)
        if onboarding_flags.get("tiene_intencion_comercial") and not is_business_faq_question(user_text):
            state["pending_onboarding_user_message"] = user_text
            _debug("pending_flow_intent_saved", user_text=user_text, onboarding_flags=onboarding_flags)
        welcome = generate_welcome_and_name_request(user_message=user_text)
        state["awaiting_customer_name"] = True
        # FAQ en el primer mensaje: bienvenida + respuesta FAQ en el mismo turno.
        if is_business_faq_question(user_text):
            state["deferred_faq_user_message"] = user_text
            state["onboarding_turn_complete"] = False
            _debug("welcome_ask_name_defer_faq", faq_text=user_text)
            return append_assistant_message(state, welcome)
        state["onboarding_turn_complete"] = True
        _debug("welcome_ask_name")
        return append_assistant_message(state, welcome)

    if saved_node not in {"", "start"}:
        state["current_node"] = saved_node
    return state
