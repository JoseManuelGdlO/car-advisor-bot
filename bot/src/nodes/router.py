"""Router conversacional para definir el siguiente paso del flujo."""

from __future__ import annotations

from src.state import clientState

from src.nodes.common import (
    append_assistant_message,
    available_brands,
    available_models_by_brand,
    is_faq_intent,
    latest_user_message,
    safe_llm_format,
)


def _is_brand_request(text: str) -> bool:
    normalized = text.strip().lower()
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
        "catálogo",
        "catalogo",
    ]
    return any(signal in normalized for signal in signals)


def _is_simple_greeting(text: str) -> bool:
    normalized = text.strip().lower()
    if not normalized:
        return False
    greetings = {
        "hola",
        "buenas",
        "buenos dias",
        "buen día",
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
    text = user_text.strip().lower()

    if is_faq_intent(text):
        state["intent"] = "faq"
        state["current_node"] = "faq"
        return state

    brand_options: list[str] = []
    try:
        brand_options = available_brands()
    except Exception:
        brand_options = []

    if text and text in [brand.lower() for brand in brand_options]:
        selected = next(brand for brand in brand_options if brand.lower() == text)
        state["selected_brand"] = selected
        state["intent"] = "vehicle_catalog"
        state["current_node"] = "car_selection"
        return state

    selected_brand = state.get("selected_brand", "")
    if selected_brand:
        try:
            model_options = available_models_by_brand(selected_brand)
        except Exception:
            model_options = []
        if text and text in [model.lower() for model in model_options]:
            selected_model = next(model for model in model_options if model.lower() == text)
            state["selected_car"] = selected_model
            state["intent"] = "vehicle_catalog"
            state["current_node"] = "lead_capture"
            return state

    if state.get("selected_brand"):
        state["intent"] = "vehicle_catalog"
        state["current_node"] = "car_selection"
        return state

    if _is_brand_request(text):
        state["intent"] = "vehicle_catalog"
        state["current_node"] = "brand_selection"
        return state

    if _is_simple_greeting(text) or not text:
        state["intent"] = "other"
        message = safe_llm_format(
            "Hola, te puedo ayudar a encontrar un carro. "
            "Si quieres, puedes preguntarme por un carro o ver las marcas disponibles.",
            [],
        )
        return append_assistant_message(state, message, [])

    state["intent"] = "other"
    message = safe_llm_format(
        "Te puedo ayudar con carros disponibles. "
        "Dime si quieres ver marcas o si buscas un modelo en particular.",
        [],
    )
    return append_assistant_message(state, message, [])
