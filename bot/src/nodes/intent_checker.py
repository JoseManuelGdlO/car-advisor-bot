"""Nodo para detectar intencion FAQ interruptiva."""

import logging

from src.state import clientState
from src.tools.vehicles import normalize_user_text

from src.services.car_selection_fallback import is_test_drive_or_visit_request
from src.services.llm_responses import (
    classify_faq_interrupt_flags,
    classify_financing_step_flags,
    classify_vehicle_step_flags,
)
from src.utils.human_advisor_notify import (
    handle_human_advisor_request,
    human_advisor_heuristic_match,
)
from src.utils.financing_advisor_notify import (
    handle_financing_detail_escalation,
    maybe_escalate_financing_detail,
)
from src.utils.financing_credit_faq import (
    clear_financing_credit_followup,
    is_credit_requirements_faq_question,
    is_short_affirmative_reply,
    suspend_financing_commercial_state,
)
from src.utils.app_logging import get_app_logger
from src.utils.signals import (
    TEST_DRIVE_VISIT_SIGNALS,
    VEHICLE_INFO_REQUEST_SIGNALS,
    is_business_faq_question,
)
from src.utils.state_helpers import latest_human_ai_pair

_TEST_DRIVE_VISIT_SIGNALS_NORMALIZED = {
    normalize_user_text(signal) for signal in TEST_DRIVE_VISIT_SIGNALS
}

logger = logging.getLogger(__name__)
_app = get_app_logger("intent_checker")


def _is_vehicle_detail_request(user_text: str) -> bool:
    """True si el usuario pide ver/mostrar/detalles de un vehiculo (subcadena sobre texto normalizado)."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return any(signal in normalized for signal in VEHICLE_INFO_REQUEST_SIGNALS)


def _promotions_flow_allows_vehicle_followup(state: clientState) -> bool:
    """Hay contexto de promo activo donde un pedido de detalle de auto no debe escalarse a asesor."""

    return bool(
        state.get("awaiting_promotion_vehicle_selection")
        or state.get("awaiting_promotion_vehicle_interest_confirmation")
        or state.get("awaiting_promotion_selection")
        or state.get("awaiting_promotion_apply_confirmation")
        or str(state.get("selected_promotion_id", "")).strip()
    )


def _has_selected_vehicle(state: clientState) -> bool:
    """lead_capture requiere selected_car; selected_vehicle_id solo no basta."""

    return bool(str(state.get("selected_car", "")).strip())


def _should_route_scheduling_to_lead_capture(state: clientState, user_text: str) -> bool:
    """Pedido de cita/prueba con vehiculo ya elegido va a lead_capture, no a asesor humano."""

    if state.get("lead_capture_done"):
        return False
    if not _has_selected_vehicle(state):
        return False
    return is_test_drive_or_visit_request(user_text, _TEST_DRIVE_VISIT_SIGNALS_NORMALIZED)


_VEHICLE_STEP_FLAGS_BLOCKING_FAQ = (
    "ask_promotions",
    "ask_financing",
    "ask_images",
    "ask_more_images",
    "wants_other_vehicles",
    "reject_purchase",
)

_FINANCING_COMMERCIAL_FLAG_KEYS = (
    "ask_promotions",
    "ask_other_vehicles",
    "ask_financing_with_vehicle",
    "wants_compare_two_plans",
    "select_plan",
    "ask_plan_vehicle_info",
    "reject_financing_keep_purchase",
)


def _financing_flow_allows_commercial_followup(state: clientState, last_ai: str, last_user: str) -> bool:
    """Prioriza navegacion comercial del paso financing frente a FAQ interruptiva (clasificador LLM)."""

    if str(state.get("current_node", "")).strip() != "financing":
        return False
    if not (
        state.get("awaiting_financing_plan_selection")
        or state.get("awaiting_financing_vehicle_selection")
    ):
        return False
    financing_flags = classify_financing_step_flags(
        previous_bot_message=last_ai,
        user_message=last_user,
        selected_vehicle_name=str(state.get("selected_car", "")).strip(),
        has_selected_vehicle=bool(str(state.get("selected_vehicle_id", "")).strip()),
        has_selected_promotion=bool(str(state.get("selected_promotion_id", "")).strip()),
        awaiting_plan_selection=bool(state.get("awaiting_financing_plan_selection")),
        awaiting_vehicle_selection=bool(state.get("awaiting_financing_vehicle_selection")),
        numbered_plan_lines="",
    )
    return any(financing_flags.get(key) for key in _FINANCING_COMMERCIAL_FLAG_KEYS)


_FINANCING_ESCALATION_NODES = frozenset(
    {"car_selection", "financing", "promotions", "lead_capture", "customer_onboarding"}
)


def _try_financing_detail_escalation_from_checker(
    state: clientState,
    *,
    current_node: str,
    last_user: str,
    last_ai: str,
    trigger_suffix: str,
) -> clientState | None:
    """Evalua escalacion por financiamiento detallado; devuelve estado escalado o None."""

    if current_node not in _FINANCING_ESCALATION_NODES:
        return None
    escalated = maybe_escalate_financing_detail(
        state,
        trigger=f"intent_checker_{trigger_suffix}",
        user_message=last_user,
        previous_bot_message=last_ai,
    )
    if escalated is None:
        return None
    saved_node = current_node
    msgs_before = len(state.get("messages", []))
    state = escalated
    state["current_node"] = saved_node
    state["is_faq_interrupt"] = False
    if saved_node in _FINANCING_ESCALATION_NODES and len(state.get("messages", [])) > msgs_before:
        state["suppress_commercial_node_once"] = True
    return state


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

    # En confirmacion de compra, las FAQ de negocio se evaluan antes que el clasificador
    # de vehiculo. confirm_purchase no bloquea FAQ: horarios/ubicacion no son cierre comercial.
    if (
        current_node == "car_selection"
        and bool(state.get("awaiting_purchase_confirmation"))
        and not is_business_faq_question(last_user)
    ):
        vehicle_flags = classify_vehicle_step_flags(
            previous_bot_message=last_ai,
            user_message=last_user,
            selected_vehicle_name=str(state.get("selected_car", "")).strip(),
        )
        if any(vehicle_flags.get(key) for key in _VEHICLE_STEP_FLAGS_BLOCKING_FAQ):
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

    # El clasificador FAQ suele marcar "asesor" si el bot acaba de mencionar contactar un asesor;
    # en flujo de promociones eso no debe bloquear "quiero ver el modelo X".
    if current_node == "promotions" and _promotions_flow_allows_vehicle_followup(state) and _is_vehicle_detail_request(
        last_user
    ):
        state["is_faq_interrupt"] = False
        return state

    if _should_route_scheduling_to_lead_capture(state, last_user):
        state["is_faq_interrupt"] = False
        state["current_node"] = "lead_capture"
        state["intent"] = "lead_capture"
        return state

    heuristic_substr = human_advisor_heuristic_match(last_user)
    heuristic_human = heuristic_substr is not None
    llm_human = bool(flags.get("quiere_asesor_humano"))
    if llm_human or heuristic_human:
        trigger_parts: list[str] = []
        if llm_human:
            trigger_parts.append("llm_quiere_asesor")
        if heuristic_human:
            trigger_parts.append(f"heuristic_match={heuristic_substr!r}")
        advisor_trigger = "+".join(trigger_parts)
        _app.info(
            "[human_advisor] intent_checker_escalation node=%s trigger=%s faq_interrupt_flags=%s",
            current_node,
            advisor_trigger,
            flags,
        )
        _app.debug(
            "[human_advisor] intent_checker_escalation_detail user_preview=%r bot_preview=%r",
            (last_user or "")[:200],
            (last_ai or "")[:200],
        )
        saved_node = current_node
        msgs_before = len(state.get("messages", []))
        state = handle_human_advisor_request(state, advisor_trigger=advisor_trigger)
        state["current_node"] = saved_node
        state["is_faq_interrupt"] = False
        # Solo suprimir el nodo comercial si esta invocacion agrego el ack del asesor;
        # si handle salio idempotente sin mensaje nuevo, promotions debe poder responder.
        if saved_node in ("car_selection", "financing", "promotions", "lead_capture") and len(
            state.get("messages", [])
        ) > msgs_before:
            state["suppress_commercial_node_once"] = True
        return state

    if (
        current_node in _FINANCING_ESCALATION_NODES
        and not flags.get("interrumpir_por_faq")
    ):
        escalated = _try_financing_detail_escalation_from_checker(
            state,
            current_node=current_node,
            last_user=last_user,
            last_ai=last_ai,
            trigger_suffix=current_node,
        )
        if escalated is not None:
            return escalated

    if state.get("financing_credit_followup_pending") and is_short_affirmative_reply(last_user):
        saved_node = current_node
        msgs_before = len(state.get("messages", []))
        state = handle_financing_detail_escalation(
            state,
            advisor_trigger="intent_checker_credit_faq_affirmative",
        )
        state["current_node"] = saved_node
        state["is_faq_interrupt"] = False
        clear_financing_credit_followup(state)
        if saved_node in _FINANCING_ESCALATION_NODES and len(state.get("messages", [])) > msgs_before:
            state["suppress_commercial_node_once"] = True
        return state

    if _financing_flow_allows_commercial_followup(state, last_ai, last_user):
        state["is_faq_interrupt"] = False
        return state

    if flags.get("interrumpir_por_faq"):
        if current_node == "financing" and is_credit_requirements_faq_question(last_user):
            suspend_financing_commercial_state(state)
        state["is_faq_interrupt"] = True
        state["resume_to_step"] = current_node or "car_selection"
        state["current_node"] = "faq"
        state["skip_car_prompt"] = True
        state["skip_lead_prompt"] = True
        return state

    state["is_faq_interrupt"] = False
    return state
