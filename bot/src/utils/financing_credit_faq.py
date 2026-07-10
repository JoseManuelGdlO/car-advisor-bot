"""Suspension del flujo comercial de financing tras FAQ de credito/requisitos."""

from __future__ import annotations

from src.state import clientState
from src.tools.vehicles import normalize_user_text

CREDIT_REQUIREMENTS_FAQ_TOPIC = "credit_requirements"

CREDIT_FAQ_ADVISOR_CLOSE = (
    "¿Te gustaría que un asesor te contacte para revisar tus dudas de crédito con más detalle?"
)

_CREDIT_REQUIREMENTS_FAQ_SUBSTR: frozenset[str] = frozenset(
    (
        "requisito",
        "requisitos",
        "comprobante de ingresos",
        "comprobacion de ingresos",
        "estados de cuenta",
        "estado de cuenta",
        "identificacion oficial",
        "credito automotriz",
        "que necesito para financiar",
        "que necesito para el credito",
        "que papeles necesito para el credito",
        "documentos para el credito",
        "documentos para financiar",
    )
)

_SHORT_AFFIRMATIVE_EXACT: frozenset[str] = frozenset(
    (
        "si",
        "claro",
        "ok",
        "okay",
        "dale",
        "va",
        "adelante",
        "por favor",
        "si por favor",
        "claro que si",
    )
)


def is_credit_requirements_faq_question(text: str) -> bool:
    """True si la FAQ trata requisitos/documentacion para credito o financiamiento."""

    normalized = normalize_user_text(text)
    if not normalized:
        return False
    if any(term in normalized for term in _CREDIT_REQUIREMENTS_FAQ_SUBSTR):
        return True
    if "credito" in normalized and any(
        hint in normalized for hint in ("requisito", "documento", "papeles", "necesito")
    ):
        return True
    return False


def is_credit_requirements_faq_interrupt(state: clientState) -> bool:
    return str(state.get("last_faq_interrupt_topic", "")).strip() == CREDIT_REQUIREMENTS_FAQ_TOPIC


def is_short_affirmative_reply(text: str) -> bool:
    """Respuesta corta afirmativa (si, claro, adelante...) para followup de credito."""

    normalized = normalize_user_text(text).strip()
    if not normalized:
        return False
    if normalized in _SHORT_AFFIRMATIVE_EXACT:
        return True
    return any(
        normalized == signal or normalized.startswith(f"{signal} ")
        for signal in ("si", "claro", "ok", "adelante", "dale")
    )


def suspend_financing_commercial_state(state: clientState) -> None:
    """Pausa seleccion de plan/vehiculo mientras se atiende FAQ de credito."""

    if is_credit_requirements_faq_interrupt(state):
        return
    state["financing_interrupt_snapshot"] = {
        "awaiting_financing_plan_selection": bool(state.get("awaiting_financing_plan_selection")),
        "awaiting_financing_vehicle_selection": bool(state.get("awaiting_financing_vehicle_selection")),
    }
    state["awaiting_financing_plan_selection"] = False
    state["awaiting_financing_vehicle_selection"] = False
    state["last_faq_interrupt_topic"] = CREDIT_REQUIREMENTS_FAQ_TOPIC


def mark_financing_credit_followup_pending(state: clientState) -> None:
    state["financing_credit_followup_pending"] = True


def clear_financing_credit_followup(state: clientState) -> None:
    state["financing_credit_followup_pending"] = False
