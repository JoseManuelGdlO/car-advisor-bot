"""Nodo para detectar intencion FAQ interruptiva."""

from src.state import clientState

from src.services.llm_responses import classify_faq_interrupt_flags
from src.utils.state_helpers import latest_human_ai_pair


def intent_checker(state: clientState) -> clientState:
    """Evalua ultimo par Human/AI para decidir continuidad o interrupcion FAQ (clasificador LLM con flags)."""

    last_user, last_ai = latest_human_ai_pair(state)
    if not last_user:
        return state

    current_node = str(state.get("current_node", "router"))
    # El intent_checker corre antes del router: fuera de flujo no debe marcar FAQ interruptiva.
    if current_node in {"", "start", "router", "faq"}:
        state["is_faq_interrupt"] = False
        return state

    # Si no hay mensaje previo del bot, no existe interrupcion de flujo.
    if not last_ai:
        state["is_faq_interrupt"] = False
        return state

    pending = state.get("last_vehicle_candidates")
    pending_n = len(pending) if isinstance(pending, list) else 0
    flags = classify_faq_interrupt_flags(
        current_node,
        last_ai,
        last_user,
        awaiting_purchase_confirmation=bool(state.get("awaiting_purchase_confirmation")),
        pending_vehicle_count=pending_n,
    )
    if flags.get("interrumpir_por_faq"):
        state["is_faq_interrupt"] = True
        state["resume_to_step"] = current_node or "car_selection"
        state["current_node"] = "faq"
        state["skip_car_prompt"] = True
        state["skip_lead_prompt"] = True
        return state

    state["is_faq_interrupt"] = False
    return state
