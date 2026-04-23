"""Router conversacional para definir el siguiente paso del flujo."""

from __future__ import annotations

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


def _is_simple_greeting(text: str) -> bool:
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

    if is_faq_intent(text):
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

    if _is_vehicle_request(text):
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
        state["intent"] = "faq"
        state["current_node"] = "faq"
        _debug_router("route_to_faq", reason="llm_classifier")
        return state

    state["intent"] = "other"
    message = generate_other_response(user_text)
    _debug_router("route_to_other", reason="llm_or_fallback")
    return append_assistant_message(state, message)
