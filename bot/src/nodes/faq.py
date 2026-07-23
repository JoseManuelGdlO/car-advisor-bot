"""Nodo FAQ con soporte de candidatos desde base de datos."""

from __future__ import annotations

from typing import Any, Mapping

from src.state import clientState
from src.tools.database import fetch_faq_candidates
from src.tools.vehicles import normalize_user_text

from src.services.llm_responses import (
    generate_faq_resume_transition,
    generate_faq_user_turn,
)
from src.utils.signals import BUSINESS_HOURS_FAQ_SUBSTR, BUSINESS_LOCATION_FAQ_SUBSTR
from src.utils.financing_advisor_notify import (
    append_down_payment_faq_if_applicable,
    maybe_escalate_financing_detail,
    resolve_down_payment_message,
)
from src.utils.financing_credit_faq import (
    CREDIT_FAQ_ADVISOR_CLOSE,
    is_credit_requirements_faq_interrupt,
    mark_financing_credit_followup_pending,
)
from src.utils.purchase_flow_messages import (
    CONTACT_PREFERENCE_MESSAGE,
    FAQ_SOFT_CATALOG_CLOSE,
    PURCHASE_PREFERENCES_REASK_BOTH,
)
from src.utils.state_helpers import (
    append_assistant_message,
    latest_human_ai_pair,
    latest_user_message,
)

_FAQ_HOURS_QUESTION_TERMS = BUSINESS_HOURS_FAQ_SUBSTR
_FAQ_LOCATION_QUESTION_TERMS = BUSINESS_LOCATION_FAQ_SUBSTR

_FAQ_HOURS_CONTEXT_TERMS = (
    "horario",
    "horarios",
    "hora de atencion",
    "horas de atencion",
    "lunes a viernes",
    "abrimos",
    "cerramos",
)

_FAQ_LOCATION_CONTEXT_TERMS = (
    "ubicacion",
    "direccion",
    "direcciones",
    "sucursal",
    "sucursales",
    "estamos en",
    "nos encuentras",
    "google maps",
)


def is_faq_hours_topic(user_question: str, faq_candidates: list[str]) -> bool:
    """Detecta si la FAQ trata sobre horarios de atencion del negocio."""

    normalized_question = normalize_user_text(user_question)
    if normalized_question and any(term in normalized_question for term in _FAQ_HOURS_QUESTION_TERMS):
        return True
    context_blob = normalize_user_text("\n".join(str(item) for item in faq_candidates if str(item).strip()))
    return bool(context_blob) and any(term in context_blob for term in _FAQ_HOURS_CONTEXT_TERMS)


def is_faq_location_topic(user_question: str, faq_candidates: list[str]) -> bool:
    """Detecta si la FAQ trata sobre ubicacion o direccion del negocio."""

    normalized_question = normalize_user_text(user_question)
    if normalized_question and any(term in normalized_question for term in _FAQ_LOCATION_QUESTION_TERMS):
        return True
    context_blob = normalize_user_text("\n".join(str(item) for item in faq_candidates if str(item).strip()))
    return bool(context_blob) and any(term in context_blob for term in _FAQ_LOCATION_CONTEXT_TERMS)


def _mid_purchase_close(state: Mapping[str, Any] | None) -> str:
    """Cierre literal mid-compra: prefs o contacto; vacio si no aplica."""

    if not state:
        return ""
    if bool(state.get("awaiting_purchase_preferences")):
        return PURCHASE_PREFERENCES_REASK_BOTH
    if bool(state.get("awaiting_purchase_confirmation")) and str(state.get("selected_car", "")).strip():
        return CONTACT_PREFERENCE_MESSAGE
    return ""


def resolve_faq_follow_up(
    user_question: str,
    faq_candidates: list[str],
    state: Mapping[str, Any] | None = None,
) -> tuple[str, str]:
    """Devuelve (cierre_literal, tema_cierre) segun tema FAQ y contexto de compra."""

    mid_close = _mid_purchase_close(state)
    if is_faq_hours_topic(user_question, faq_candidates):
        return mid_close, "horarios"
    if is_faq_location_topic(user_question, faq_candidates):
        return mid_close, "ubicacion"
    return FAQ_SOFT_CATALOG_CLOSE, "general"


def faq(state: clientState) -> clientState:
    """Responde preguntas frecuentes y retorna al flujo principal cuando aplica."""

    state["current_node"] = "faq"
    question = latest_user_message(state)

    escalated = maybe_escalate_financing_detail(state, trigger="faq_node_entry", user_message=question)
    if escalated is not None:
        return escalated

    if resolve_down_payment_message(question):
        state["intent"] = "other"
        state["current_node"] = "router"
        state["is_faq_interrupt"] = False
        return append_down_payment_faq_if_applicable(state, question)

    candidates = fetch_faq_candidates(question)

    if state.get("is_faq_interrupt"):
        resume_to_step = str(state.get("resume_to_step", "car_selection"))
        _last_user, last_ai = latest_human_ai_pair(state)
        _, close_topic = resolve_faq_follow_up(question, candidates, state)
        awaiting_prefs = bool(state.get("awaiting_purchase_preferences"))
        awaiting_contact = bool(state.get("awaiting_purchase_confirmation"))
        if is_credit_requirements_faq_interrupt(state):
            transition = CREDIT_FAQ_ADVISOR_CLOSE
            mark_financing_credit_followup_pending(state)
            used_close = ""
        elif awaiting_prefs:
            transition = PURCHASE_PREFERENCES_REASK_BOTH
            used_close = ""
        elif awaiting_contact:
            # Mid-compra: retoma preferencia de contacto (no "agendar cita" generico).
            transition = CONTACT_PREFERENCE_MESSAGE
            used_close = ""
        else:
            transition = generate_faq_resume_transition(
                user_message=question,
                last_bot_message=last_ai or str(state.get("last_bot_message", "")),
                resume_to_step=resume_to_step,
                state=state,
            )
            used_close = ""
        message = generate_faq_user_turn(
            user_question=question,
            faq_candidates=candidates,
            transition_literal=transition,
            close_literal=used_close,
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
        close_literal, close_topic = resolve_faq_follow_up(question, candidates, state)
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
