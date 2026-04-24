"""Nodo FAQ con soporte de candidatos desde base de datos."""

from src.state import clientState
from src.tools.database import fetch_faq_candidates

from src.services.llm_responses import generate_faq_response
from src.utils.state_helpers import append_assistant_message, latest_user_message


def faq(state: clientState) -> clientState:
    """Responde preguntas frecuentes y retorna al flujo principal cuando aplica."""

    state["current_node"] = "faq"
    question = latest_user_message(state)
    candidates = fetch_faq_candidates(question)
    message = generate_faq_response(question, candidates)

    if state.get("is_faq_interrupt"):
        resume_to_step = str(state.get("resume_to_step", "car_selection"))
        transitions = {
            "car_selection": "Perfecto, continuemos con los modelos disponibles.",
            "lead_capture": "Perfecto, continuemos con tus datos para apartar el vehiculo.",
            "financing": "Perfecto, continuemos con los planes de financiamiento.",
        }
        transition = transitions.get(resume_to_step)
        if transition:
            message = f"{message}\n\n{transition}"
        state["is_faq_interrupt"] = False
        state["current_node"] = resume_to_step
        state["resume_to_step"] = ""
        # Estas banderas solo deben evitar ejecución dentro del turno interrumpido.
        state["skip_car_prompt"] = False
        state["skip_lead_prompt"] = False
    return append_assistant_message(state, message)
