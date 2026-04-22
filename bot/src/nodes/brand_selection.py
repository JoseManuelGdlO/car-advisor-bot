"""Nodo para seleccion de marca de vehiculo."""

from src.state import clientState

from src.nodes.common import append_assistant_message, available_brands, safe_llm_format


def brand_selection(state: clientState) -> clientState:
    """Solicita al usuario elegir una marca disponible."""

    state["current_node"] = "brand_selection"
    if not state.get("skip_brand_prompt"):
        state["selected_brand"] = ""
        state["selected_car"] = ""

    try:
        brand_options = available_brands()
    except Exception:
        brand_options = []

    if not brand_options:
        base_text = (
            "No pude consultar las marcas disponibles en este momento. "
            "Intenta de nuevo en unos segundos."
        )
        message = safe_llm_format(base_text, [])
        state["skip_brand_prompt"] = False
        return append_assistant_message(state, message, [])

    base_text = "Perfecto, estas son las marcas disponibles. Elige una para continuar."
    message = safe_llm_format(base_text, brand_options)
    state["skip_brand_prompt"] = False
    return append_assistant_message(state, message, brand_options)
