"""Router conversacional para definir el siguiente paso del flujo."""

from __future__ import annotations

import re

from src.state import clientState

from src.services.llm_responses import classify_router_intent, generate_other_response
from src.tools.vehicles import normalize_user_text
from src.utils.state_helpers import append_assistant_message, is_faq_intent, latest_user_message


def _debug_router(event: str, **payload: object) -> None:
    """Trazas de decisión del router para seguir en consola."""

    if payload:
        pairs = ", ".join(f"{key}={value!r}" for key, value in payload.items())
        print(f"[router] {event} | {pairs}")
        return
    print(f"[router] {event}")


def _is_vehicle_request(text: str) -> bool:
    """Retorna True cuando is vehicle request."""
    normalized = normalize_user_text(text)
    if not normalized:
        return False
    signals = [
        "marca",
        "marcas",
        "carro",
        "carros",
        "auto",
        "autos",
        "modelo",
        "modelos",
        "vehiculo",
        "vehiculos",
        "catalogo",
        "disponible",
        "disponibles",
        "color",
        "ano",
        "año",
        "precio",
        "camioneta",
        "pickup",
        "catalogo",
    ]
    return any(signal in normalized for signal in signals)


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
    signals = [
        "financiamiento",
        "financiar",
        "financiado",
        "credito",
        "credito automotriz",
        "mensualidad",
        "mensualidades",
        "enganche",
        "tasa",
        "interes",
        "plazo",
        "plan financiero",
        "planes financieros",
        "plan de financiamiento",
        "planes de financiamiento",
        "pagos",
        "plan de pagos",
        "planes de pagos",
    ]
    return any(signal in normalized for signal in signals)


def _is_promotions_request(text: str) -> bool:
    """Retorna True cuando is promotions request."""
    normalized = normalize_user_text(text)
    if not normalized:
        return False
    signals = [
        "promocion",
        "promociones",
        "oferta",
        "ofertas",
        "descuento",
        "descuentos",
        "bono",
        "bonos",
    ]
    return any(signal in normalized for signal in signals)


def _is_simple_greeting(text: str) -> bool:
    """Retorna True cuando is simple greeting."""
    normalized = normalize_user_text(text)
    if not normalized:
        return False
    greetings = {
        "hola",
        "buenas",
        "buenos dias",
        "buen dia",
        "buenas tardes",
        "buenas noches",
        "hey",
        "holi",
    }
    return normalized in greetings


def router(state: clientState) -> clientState:
    """Clasifica intención básica y enruta el flujo conversacional."""

    state["current_node"] = "router"
    user_text = latest_user_message(state)
    text = normalize_user_text(user_text)
    _debug_router(
        "entry",
        user_text=user_text,
        normalized_text=text,
        previous_intent=state.get("intent", ""),
        awaiting_purchase_confirmation=bool(state.get("awaiting_purchase_confirmation")),
        pending_candidates=bool(state.get("last_vehicle_candidates")),
    )

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
    vehicle_like = _is_vehicle_request(text) or _looks_like_specific_vehicle_request(text)
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

    classified_intent = classify_router_intent(user_text, str(state.get("intent", "")))
    _debug_router("llm_intent_classification", classified_intent=classified_intent)

    if classified_intent == "VEHICLE_CATALOG":
        state["intent"] = "vehicle_catalog"
        state["current_node"] = "car_selection"
        _debug_router("route_to_car_selection", reason="llm_classifier")
        return state

    if classified_intent == "FAQ":
        if vehicle_like:
            state["intent"] = "vehicle_catalog"
            state["current_node"] = "car_selection"
            _debug_router("route_to_car_selection", reason="faq_classified_but_vehicle_detected")
            return state
        state["intent"] = "faq"
        state["current_node"] = "faq"
        _debug_router("route_to_faq", reason="llm_classifier")
        return state
    if classified_intent == "PROMOTIONS":
        state["intent"] = "promotions"
        state["current_node"] = "promotions"
        _debug_router("route_to_promotions", reason="llm_classifier")
        return state
    if classified_intent == "FINANCING":
        state["intent"] = "financing"
        state["current_node"] = "financing"
        _debug_router("route_to_financing", reason="llm_classifier")
        return state

    state["intent"] = "other"
    message = generate_other_response(user_text)
    _debug_router("route_to_other", reason="llm_or_fallback")
    return append_assistant_message(state, message)
