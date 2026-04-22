"""Nodo para seleccion de modelo segun marca."""

from src.state import clientState

from src.nodes.common import (
    append_assistant_message,
    available_brands,
    available_models_by_brand,
    safe_llm_format,
)


def car_selection(state: clientState) -> clientState:
    """Muestra modelos segun la marca elegida."""

    state["current_node"] = "car_selection"
    selected_brand = state.get("selected_brand", "")
    if state.get("skip_car_prompt"):
        state["skip_car_prompt"] = False
        return state

    try:
        brand_options = available_brands()
    except Exception:
        brand_options = []
    if selected_brand not in brand_options:
        base_text = "No reconoci la marca. Elige una opcion valida para continuar."
        message = safe_llm_format(base_text, brand_options)
        state["current_node"] = "brand_selection"
        return append_assistant_message(state, message, brand_options)

    try:
        model_options = available_models_by_brand(selected_brand)
    except Exception:
        model_options = []
    if not model_options:
        base_text = (
            f"No encontre modelos disponibles para {selected_brand} en este momento. "
            "Elige otra marca."
        )
        message = safe_llm_format(base_text, brand_options)
        state["current_node"] = "brand_selection"
        return append_assistant_message(state, message, brand_options)

    base_text = f"Excelente. Estos son los modelos disponibles en {selected_brand}."
    message = safe_llm_format(base_text, model_options)
    return append_assistant_message(state, message, model_options)
