"""Nodo para seleccion de carro segun categoria."""

from src.state import clientState

from src.nodes.common import (
    CAR_OPTIONS_BY_CATEGORY,
    CATEGORY_OPTIONS,
    append_assistant_message,
    safe_llm_format,
)


def car_selection(state: clientState) -> clientState:
    """Muestra modelos segun categoria elegida."""

    selected_category = state.get("selected_category", "")
    if state.get("skip_car_prompt"):
        state["skip_car_prompt"] = False
        return state
    if selected_category not in CAR_OPTIONS_BY_CATEGORY:
        base_text = "No reconoci la categoria. Elige una opcion valida."
        message = safe_llm_format(base_text, CATEGORY_OPTIONS)
        state["current_node"] = "category_selection"
        return append_assistant_message(state, message, CATEGORY_OPTIONS)

    car_options = CAR_OPTIONS_BY_CATEGORY[selected_category]
    base_text = f"Excelente. Estos son los modelos disponibles en {selected_category}."
    message = safe_llm_format(base_text, car_options)
    state["current_node"] = "car_selection"
    return append_assistant_message(state, message, car_options)
