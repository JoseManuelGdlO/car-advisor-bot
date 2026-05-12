"""Nodo FAQ con soporte de candidatos desde base de datos."""

from src.state import clientState
from src.tools.database import fetch_faq_candidates

from src.services.llm_responses import generate_faq_user_turn
from src.utils.state_helpers import append_assistant_message, latest_user_message


def faq(state: clientState) -> clientState:
    """Responde preguntas frecuentes y retorna al flujo principal cuando aplica."""

    state["current_node"] = "faq"
    question = latest_user_message(state)
    candidates = fetch_faq_candidates(question)

    if state.get("is_faq_interrupt"):
        resume_to_step = str(state.get("resume_to_step", "car_selection"))
        transitions = {
            "car_selection": "Perfecto, continuemos con los modelos disponibles.",
            "lead_capture": "Perfecto, continuemos con tus datos para apartar el vehiculo.",
            "financing": "Perfecto, continuemos con los planes de financiamiento.",
        }
        transition = transitions.get(resume_to_step) or ""
        message = generate_faq_user_turn(
            user_question=question,
            faq_candidates=candidates,
            transition_literal=transition,
            close_literal="",
            compact_faq_body=True,
        )
        state["is_faq_interrupt"] = False
        state["current_node"] = resume_to_step
        state["resume_to_step"] = ""
        # Estas banderas solo deben evitar ejecución dentro del turno interrumpido.
        state["skip_car_prompt"] = False
        state["skip_lead_prompt"] = False
        if resume_to_step == "car_selection":
            state["intent"] = "vehicle_catalog"
        elif resume_to_step == "financing":
            state["intent"] = "financing"
        else:
            state["intent"] = "other"
    else:
        message = generate_faq_user_turn(
            user_question=question,
            faq_candidates=candidates,
            transition_literal="",
            close_literal="¿Hay algo más en lo que pueda ayudarte?",
            compact_faq_body=False,
        )
        state["intent"] = "other"
    return append_assistant_message(state, message)
