"""Nodo FAQ con soporte de candidatos desde base de datos."""

from src.state import clientState
from src.tools.database import fetch_faq_candidates

from src.nodes.common import append_assistant_message, available_brands, latest_user_message, safe_llm_format


def faq(state: clientState) -> clientState:
    """Responde preguntas frecuentes y retorna al flujo principal cuando aplica."""

    state["current_node"] = "faq"
    question = latest_user_message(state)
    try:
        options = available_brands()
    except Exception:
        options = []
    candidates = fetch_faq_candidates(question)
    if candidates:
        faq_context = " | ".join(candidates)
        base_text = (
            f"Pregunta del usuario: {question}. "
            f"Responde usando este contexto FAQ: {faq_context}"
        )
    else:
        base_text = (
            "Puedo ayudarte a elegir marcas, comparar modelos y capturar tus datos "
            "para que te contacte un asesor."
        )
    message = safe_llm_format(base_text, options)

    if state.get("is_faq_interrupt"):
        state["is_faq_interrupt"] = False
        state["current_node"] = state.get("resume_to_step", "brand_selection")
        state["resume_to_step"] = ""
    return append_assistant_message(state, message, options)
