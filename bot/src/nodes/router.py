"""Router conversacional para definir el siguiente paso del flujo."""

from __future__ import annotations

import re

from src.state import clientState

from src.services.car_selection_fallback import contains_signal_phrase
from src.services.llm_responses import classify_router_intent, generate_other_response
from src.tools.vehicles import normalize_user_text
from src.utils.human_advisor_notify import handle_human_advisor_request, human_advisor_heuristic_match
from src.utils.signals import (
    BUSINESS_LOCATION_FAQ_SUBSTR,
    FINANCING_PLANES_COMBO_SUFFIXES,
    FINANCING_SIGNALS,
    PROMOTIONS_SIGNALS,
    ROUTER_SIMPLE_GREETINGS_NORMALIZED,
    ROUTER_VEHICLE_SUBSTR_SIGNALS,
)
from src.utils.app_logging import get_app_logger, log_flow_trace
from src.utils.state_helpers import append_assistant_message, is_faq_intent, latest_human_ai_pair, latest_user_message

_log = get_app_logger("router")


def _debug_router(event: str, **payload: object) -> None:
    """Trazas de decisión del router para seguir en consola."""

    log_flow_trace(_log, "router", event, **payload)


def _is_vehicle_request(text: str, *, last_bot_message: str = "") -> bool:
    """Retorna True cuando is vehicle request."""
    normalized = normalize_user_text(text)
    if not normalized:
        return False
    return any(signal in normalized for signal in ROUTER_VEHICLE_SUBSTR_SIGNALS)


def _looks_like_specific_vehicle_request(text: str) -> bool:
    """Detecta menciones de un vehiculo puntual aunque no traiga keywords de catalogo."""

    normalized = normalize_user_text(text)
    if not normalized:
        return False
    if re.search(r"\b(?:el|la|un|una)\s+[a-z]{3,}\s+\d{1,4}\b", normalized):
        return True
    if re.search(r"\b[a-z]{3,}\s+\d{1,4}\b", normalized):
        return True
    if re.search(r"\b(tienes|hay|busco|quiero)\s+[a-z0-9]{3,}\b", normalized):
        return True
    return False


def _is_financing_request(text: str) -> bool:
    """Retorna True cuando is financing request."""
    normalized = normalize_user_text(text)
    if not normalized:
        return False
    return any(contains_signal_phrase(normalized, signal) for signal in FINANCING_SIGNALS)


def _is_promotions_request(text: str) -> bool:
    """Retorna True cuando is promotions request."""
    normalized = normalize_user_text(text)
    if not normalized:
        return False
    return any(contains_signal_phrase(normalized, signal) for signal in PROMOTIONS_SIGNALS)


def _is_simple_greeting(text: str) -> bool:
    """Retorna True cuando is simple greeting."""
    normalized = normalize_user_text(text)
    if not normalized:
        return False
    return normalized in ROUTER_SIMPLE_GREETINGS_NORMALIZED


_VALID_ROUTER_LABELS = frozenset({"VEHICLE_CATALOG", "FAQ", "FINANCING", "PROMOTIONS", "HUMAN_ADVISOR"})


def _financing_planes_combo(text: str) -> bool:
    """Planes de pago/credito sin la frase completa 'planes de financiamiento' en el texto."""

    n = normalize_user_text(text)
    if not n:
        return False
    if not ("planes" in n or " plan " in n or re.search(r"\bplan\b", n)):
        return False
    return any(s in n for s in FINANCING_PLANES_COMBO_SUFFIXES)


def _is_business_location_faq(text: str) -> bool:
    """Ubicacion o direccion del negocio (normalizado, sin acentos)."""

    n = normalize_user_text(text)
    if not n:
        return False
    return any(s in n for s in BUSINESS_LOCATION_FAQ_SUBSTR)


def _extended_router_heuristic(user_text: str, *, last_bot_message: str = "") -> str | None:
    """Etiqueta alineada con classify_router_intent o None si no hay señal clara."""

    if human_advisor_heuristic_match(user_text):
        return "HUMAN_ADVISOR"
    if _is_financing_request(user_text) or _financing_planes_combo(user_text):
        return "FINANCING"
    if _is_promotions_request(user_text):
        return "PROMOTIONS"
    if _is_vehicle_request(user_text, last_bot_message=last_bot_message) or _looks_like_specific_vehicle_request(user_text):
        return "VEHICLE_CATALOG"
    if is_faq_intent(user_text) or _is_business_location_faq(user_text):
        return "FAQ"
    return None


def _sanitize_previous_intent_for_classifier(intent: str) -> str:
    """Evita sesgo 'Intent previo: faq' en el clasificador LLM."""

    cleaned = str(intent or "").strip()
    if cleaned == "faq":
        return "other"
    return cleaned


def _reconcile_llm_and_heuristic(llm_label: str, heuristic_label: str | None) -> str:
    """Fusiona etiqueta LLM con heuristica extendida (llm_label ya valido)."""

    if heuristic_label == "FINANCING" and llm_label == "FAQ":
        return "FINANCING"
    if heuristic_label == "PROMOTIONS" and llm_label == "FAQ":
        return "PROMOTIONS"
    if heuristic_label == "VEHICLE_CATALOG" and llm_label == "FAQ":
        return "VEHICLE_CATALOG"
    if heuristic_label == "HUMAN_ADVISOR" and llm_label == "FAQ":
        return "HUMAN_ADVISOR"
    return llm_label


def _apply_router_resolution(
    state: clientState,
    resolved: str,
    *,
    vehicle_like: bool,
    reason: str,
) -> clientState:
    """Aplica etiqueta resuelta a intent/current_node."""

    if resolved == "VEHICLE_CATALOG":
        state["intent"] = "vehicle_catalog"
        state["current_node"] = "car_selection"
        _debug_router("route_to_car_selection", reason=reason)
        return state
    if resolved == "FAQ":
        if vehicle_like:
            state["intent"] = "vehicle_catalog"
            state["current_node"] = "car_selection"
            _debug_router("route_to_car_selection", reason="faq_resolved_but_vehicle_detected")
            return state
        state["intent"] = "faq"
        state["current_node"] = "faq"
        _debug_router("route_to_faq", reason=reason)
        return state
    if resolved == "PROMOTIONS":
        state["intent"] = "promotions"
        state["current_node"] = "promotions"
        _debug_router("route_to_promotions", reason=reason)
        return state
    if resolved == "FINANCING":
        state["intent"] = "financing"
        state["current_node"] = "financing"
        _debug_router("route_to_financing", reason=reason)
        return state
    if resolved == "HUMAN_ADVISOR":
        state["intent"] = "human_advisor"
        state["current_node"] = "router"
        _debug_router("route_human_advisor", reason=reason)
        return handle_human_advisor_request(state, advisor_trigger="router_resolution_human_advisor")
    raise ValueError(f"etiqueta router no soportada: {resolved!r}")


def router(state: clientState) -> clientState:
    """Clasifica intención básica y enruta el flujo conversacional."""

    state["current_node"] = "router"
    user_text = latest_user_message(state)
    text = normalize_user_text(user_text)
    _last_user, last_ai = latest_human_ai_pair(state)
    last_bot_message = last_ai or str(state.get("last_bot_message", ""))
    _debug_router(
        "entry",
        user_text=user_text,
        normalized_text=text,
        previous_intent=state.get("intent", ""),
        awaiting_purchase_confirmation=bool(state.get("awaiting_purchase_confirmation")),
        pending_candidates=bool(state.get("last_vehicle_candidates")),
    )

    if human_advisor_heuristic_match(user_text):
        state["intent"] = "human_advisor"
        state["current_node"] = "router"
        _debug_router("route_human_advisor", reason="heuristic")
        return handle_human_advisor_request(state, advisor_trigger="router_early_heuristic")

    if _is_financing_request(text):
        state["intent"] = "financing"
        state["current_node"] = "financing"
        _debug_router("route_to_financing", reason="financing_signal")
        return state

    if _is_promotions_request(text):
        state["intent"] = "promotions"
        state["current_node"] = "promotions"
        _debug_router("route_to_promotions", reason="promotions_signal")
        return state

    faq_like = is_faq_intent(text)
    vehicle_like = _is_vehicle_request(user_text, last_bot_message=last_bot_message) or _looks_like_specific_vehicle_request(
        user_text
    )
    if faq_like and vehicle_like:
        state["intent"] = "vehicle_catalog"
        state["current_node"] = "car_selection"
        _debug_router("route_to_car_selection", reason="hybrid_question_vehicle_priority")
        return state

    if faq_like:
        state["intent"] = "faq"
        state["current_node"] = "faq"
        _debug_router("route_to_faq")
        return state

    if state.get("awaiting_purchase_confirmation") or state.get("last_vehicle_candidates"):
        state["intent"] = "vehicle_catalog"
        state["current_node"] = "car_selection"
        _debug_router("route_to_car_selection", reason="state_flags")
        return state

    if state.get("intent") == "vehicle_catalog" and text and not _is_simple_greeting(text):
        state["current_node"] = "car_selection"
        _debug_router("route_to_car_selection", reason="vehicle_catalog_context")
        return state
    if state.get("intent") == "financing" and text and not _is_simple_greeting(text):
        state["current_node"] = "financing"
        _debug_router("route_to_financing", reason="financing_context")
        return state
    if state.get("intent") == "promotions" and text and not _is_simple_greeting(text):
        state["current_node"] = "promotions"
        _debug_router("route_to_promotions", reason="promotions_context")
        return state

    if vehicle_like:
        state["intent"] = "vehicle_catalog"
        state["current_node"] = "car_selection"
        _debug_router("route_to_car_selection", reason="vehicle_request_signal")
        return state

    if not text:
        state["intent"] = "other"
        message = generate_other_response(user_text)
        _debug_router("route_to_other", reason="empty")
        return append_assistant_message(state, message)

    if _is_simple_greeting(text):
        state["intent"] = "other"
        message = generate_other_response(user_text)
        _debug_router("route_to_other", reason="simple_greeting")
        return append_assistant_message(state, message)

    heuristic_intent = _extended_router_heuristic(user_text, last_bot_message=last_bot_message)
    previous_intent_sanitized = _sanitize_previous_intent_for_classifier(str(state.get("intent", "")))
    llm_intent = classify_router_intent(user_text, previous_intent_sanitized)
    _debug_router(
        "hybrid_intent",
        heuristic_intent=heuristic_intent,
        llm_intent=llm_intent,
        previous_intent_sanitized=previous_intent_sanitized,
    )

    if llm_intent in _VALID_ROUTER_LABELS:
        resolved = _reconcile_llm_and_heuristic(llm_intent, heuristic_intent)
        reason = "llm_plus_heuristic" if resolved != llm_intent else "llm_classifier"
        _debug_router("resolved_intent", resolved=resolved, reason=reason)
        return _apply_router_resolution(state, resolved, vehicle_like=vehicle_like, reason=reason)

    if heuristic_intent:
        _debug_router("resolved_intent", resolved=heuristic_intent, reason="llm_failed_heuristic_fallback")
        return _apply_router_resolution(state, heuristic_intent, vehicle_like=vehicle_like, reason="heuristic_fallback")

    state["intent"] = "other"
    message = generate_other_response(user_text)
    _debug_router("route_to_other", reason="llm_and_heuristic_fallback")
    return append_assistant_message(state, message)
