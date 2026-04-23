"""Nodo para detectar intencion FAQ interruptiva."""

from src.state import clientState

from src.utils.state_helpers import is_faq_intent, latest_human_ai_pair


def intent_checker(state: clientState) -> clientState:
    """Evalua ultimo par Human/AI para decidir continuidad o interrupcion FAQ."""

    last_user, _last_ai = latest_human_ai_pair(state)
    if is_faq_intent(last_user):
        state["is_faq_interrupt"] = True
        state["resume_to_step"] = state.get("current_node", "car_selection")
        state["current_node"] = "faq"
        state["skip_car_prompt"] = True
        state["skip_lead_prompt"] = True
        return state
    return state
