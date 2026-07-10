"""Nodo FAQ con soporte de candidatos desde base de datos."""

from __future__ import annotations

from src.state import clientState
from src.tools.database import fetch_faq_candidates
from src.tools.vehicles import normalize_user_text

from src.services.llm_responses import (
    generate_faq_resume_transition,
    generate_faq_user_turn,
)
from src.utils.signals import BUSINESS_HOURS_FAQ_SUBSTR
from src.utils.state_helpers import (
    append_assistant_message,
    latest_human_ai_pair,
    latest_user_message,
)

_FAQ_DEFAULT_CLOSE = "¿Hay algo más en lo que pueda ayudarte?"
_FAQ_HOURS_CLOSE = "¿Te gustaría agendar una cita?"

_FAQ_HOURS_QUESTION_TERMS = BUSINESS_HOURS_FAQ_SUBSTR

_FAQ_HOURS_CONTEXT_TERMS = (
    "horario",
    "horarios",
    "hora de atencion",
    "horas de atencion",
    "lunes a viernes",
    "abrimos",
    "cerramos",
)


def is_faq_hours_topic(user_question: str, faq_candidates: list[str]) -> bool:
    """Detecta si la FAQ trata sobre horarios de atencion del negocio."""

    normalized_question = normalize_user_text(user_question)
    if normalized_question and any(term in normalized_question for term in _FAQ_HOURS_QUESTION_TERMS):
        return True
    context_blob = normalize_user_text("\n".join(str(item) for item in faq_candidates if str(item).strip()))
    return bool(context_blob) and any(term in context_blob for term in _FAQ_HOURS_CONTEXT_TERMS)


def resolve_faq_follow_up(user_question: str, faq_candidates: list[str]) -> tuple[str, str]:
    """Devuelve (cierre_literal, tema_cierre) para el turno FAQ standalone."""

    if is_faq_hours_topic(user_question, faq_candidates):
        return _FAQ_HOURS_CLOSE, "horarios"
    return _FAQ_DEFAULT_CLOSE, "general"


def faq(state: clientState) -> clientState:
    """Responde preguntas frecuentes y retorna al flujo principal cuando aplica."""

    state["current_node"] = "faq"
    question = latest_user_message(state)
    candidates = fetch_faq_candidates(question)

    if state.get("is_faq_interrupt"):
        resume_to_step = str(state.get("resume_to_step", "car_selection"))
        _last_user, last_ai = latest_human_ai_pair(state)
        transition = generate_faq_resume_transition(
            user_message=question,
            last_bot_message=last_ai or str(state.get("last_bot_message", "")),
            resume_to_step=resume_to_step,
            state=state,
        )
        _close_literal, close_topic = resolve_faq_follow_up(question, candidates)
        message = generate_faq_user_turn(
            user_question=question,
            faq_candidates=candidates,
            transition_literal=transition,
            close_literal="",
            faq_close_topic=close_topic,
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
        close_literal, close_topic = resolve_faq_follow_up(question, candidates)
        message = generate_faq_user_turn(
            user_question=question,
            faq_candidates=candidates,
            transition_literal="",
            close_literal=close_literal,
            faq_close_topic=close_topic,
            compact_faq_body=False,
        )
        state["intent"] = "other"
        state["current_node"] = "router"
    return append_assistant_message(state, message)
