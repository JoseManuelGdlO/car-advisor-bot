"""Nodo para seleccion de categoria de vehiculo."""

from src.state import clientState

from src.nodes.common import CATEGORY_OPTIONS, append_assistant_message, safe_llm_format


def category_selection(state: clientState) -> clientState:
    """Solicita al usuario elegir una categoria principal."""

    state["current_node"] = "category_selection"
    if not state.get("skip_category_prompt"):
        state["selected_category"] = ""
        state["selected_car"] = ""
    base_text = "Perfecto, para comenzar elige una categoria de vehiculo."
    message = safe_llm_format(base_text, CATEGORY_OPTIONS)
    state["skip_category_prompt"] = False
    return append_assistant_message(state, message, CATEGORY_OPTIONS)
