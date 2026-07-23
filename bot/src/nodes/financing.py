"""Nodo de financiamiento: respuesta informativa (estilo FAQ) sin seleccion de plan."""

from __future__ import annotations

from typing import Any

from src.services.car_selection_fallback import is_promotions_request
from src.state import clientState
from src.tools.database import (
    fetch_financing_plans,
    fetch_financing_plans_by_vehicle,
    persist_commercial_selection_to_backend,
)
from src.tools.vehicles import normalize_user_text
from src.utils.app_logging import get_app_logger, log_flow_trace
from src.utils.financing_advisor_notify import (
    append_down_payment_faq_if_applicable,
    is_generic_down_payment_only_question,
    maybe_escalate_financing_detail,
    resolve_down_payment_message,
)
from src.utils.formatters import format_financing_plans, format_financing_plans_for_vehicle
from src.utils.purchase_flow_messages import (
    FAQ_SOFT_CATALOG_CLOSE,
    PURCHASE_PREFERENCES_REASK_BOTH,
    commercial_info_follow_up,
    is_contact_preference_message,
    mark_contact_preference_prompt_sent,
)
from src.utils.signals import PROMOTIONS_SIGNALS
from src.utils.state_helpers import append_assistant_message, latest_user_message

_log = get_app_logger("financing")

_PROMOTIONS_SIGNALS_NORMALIZED = {normalize_user_text(s) for s in PROMOTIONS_SIGNALS}

_OTHER_VEHICLES_SIGNALS = frozenset(
    {
        "otros vehiculos",
        "otros carros",
        "otro carro",
        "otro modelo",
        "otros modelos",
        "ver catalogo",
        "ver modelos",
        "mas opciones",
        "mostrar catalogo",
    }
)


def _debug(event: str, **payload: Any) -> None:
    """Trazas del flujo de financiamiento; payload completo solo con LOG_LEVEL=debug."""

    log_flow_trace(_log, "financing", event, **payload)


def _clear_selection_flags(state: clientState) -> None:
    state["awaiting_financing_plan_selection"] = False
    state["awaiting_financing_vehicle_selection"] = False
    state["financing_plan_candidates"] = []
    state["financing_vehicle_candidates"] = []
    state["pending_financing_after_promotion"] = False


def _wants_other_vehicles(user_text: str) -> bool:
    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return any(signal in normalized for signal in _OTHER_VEHICLES_SIGNALS)


def _plan_has_available_vehicle_row(plan: dict[str, Any]) -> bool:
    vehicles = plan.get("vehicles")
    if not isinstance(vehicles, list):
        return True
    for v in vehicles:
        if isinstance(v, dict) and str(v.get("status", "")).strip().lower() in ("", "available"):
            return True
    return False


def _filter_active_plans(plans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for plan in plans:
        if not isinstance(plan, dict):
            continue
        if not bool(plan.get("active", True)):
            continue
        if plan.get("vehicles") is not None and not _plan_has_available_vehicle_row(plan):
            continue
        out.append(plan)
    return out


def _set_primary_plan(state: clientState, plan: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(plan, dict):
        state["selected_financing_plan_id"] = ""
        state["selected_financing_plan_name"] = ""
        state["selected_financing_plan_lender"] = ""
        return {}
    plan_id = str(plan.get("id", "")).strip()
    plan_name = str(plan.get("name", "")).strip()
    lender = str(plan.get("lender", "")).strip()
    state["selected_financing_plan_id"] = plan_id
    state["selected_financing_plan_name"] = plan_name
    state["selected_financing_plan_lender"] = lender
    selected_car = str(state.get("selected_car", "")).strip()
    selection = {
        "plan_id": plan_id,
        "plan_name": plan_name,
        "lender": lender,
        "vehicle_id": str(state.get("selected_vehicle_id", "")).strip(),
        "vehicle_name": selected_car,
    }
    if not any(selection.values()):
        return {}
    return selection


def _apply_follow_up_routing(state: clientState, follow_up: str) -> None:
    """Deja flags listos para el siguiente turno; current_node=router para terminar el invoke."""

    state["intent"] = "vehicle_catalog"
    state["current_node"] = "router"
    if follow_up == PURCHASE_PREFERENCES_REASK_BOTH:
        state["awaiting_purchase_preferences"] = True
        return
    if is_contact_preference_message(follow_up):
        state["awaiting_purchase_confirmation"] = True
        state["awaiting_purchase_preferences"] = False
        mark_contact_preference_prompt_sent(state)
        return
    if follow_up == FAQ_SOFT_CATALOG_CLOSE and not str(state.get("selected_car", "")).strip():
        state["awaiting_purchase_confirmation"] = False


def financing(state: clientState) -> clientState:
    """Muestra planes de forma informativa y empuja el flujo comercial con un follow-up."""

    if state.get("suppress_commercial_node_once"):
        state["suppress_commercial_node_once"] = False
        _debug("suppressed_once")
        return state

    state["current_node"] = "financing"
    state["intent"] = "financing"
    user_text = latest_user_message(state)
    _clear_selection_flags(state)

    escalated = maybe_escalate_financing_detail(
        state,
        trigger="financing_node_entry",
        user_message=user_text,
    )
    if escalated is not None:
        return escalated

    if resolve_down_payment_message(user_text) and is_generic_down_payment_only_question(user_text):
        state["intent"] = "other"
        state["current_node"] = "router"
        return append_down_payment_faq_if_applicable(state, user_text)

    if is_promotions_request(user_text, _PROMOTIONS_SIGNALS_NORMALIZED):
        state["current_node"] = "promotions"
        state["intent"] = "promotions"
        _debug("hop_to_promotions")
        return state

    if _wants_other_vehicles(user_text):
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        _debug("hop_to_car_selection_other_vehicles")
        return state

    selected_vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
    selected_car = str(state.get("selected_car", "")).strip()
    platform = str(state.get("platform", "web")).strip().lower() or "web"

    plans: list[dict[str, Any]] = []
    listing = ""
    if selected_vehicle_id:
        try:
            plans = fetch_financing_plans_by_vehicle(selected_vehicle_id)
        except Exception:
            _debug("plans_for_vehicle_fetch_error", selected_vehicle_id=selected_vehicle_id)
            plans = []
        plans = _filter_active_plans(plans)
        if plans:
            listing = format_financing_plans_for_vehicle(
                selected_car or "este vehiculo",
                plans,
                platform=platform,
            )
        else:
            listing = (
                f"No encontre planes de financiamiento activos para "
                f"{selected_car or 'este vehiculo'}."
            )
    else:
        try:
            plans = fetch_financing_plans()
        except Exception:
            _debug("plans_global_fetch_error")
            plans = []
        plans = _filter_active_plans(plans)
        listing = format_financing_plans(plans, platform=platform)

    primary = plans[0] if plans else None
    financing_selection = _set_primary_plan(state, primary)
    if financing_selection:
        persist_commercial_selection_to_backend(
            state,
            financing_selection=financing_selection,
            message=f"Consulta de financiamiento: {financing_selection.get('plan_name') or 'plan'}",
        )

    follow_up = commercial_info_follow_up(state)
    message = f"{listing}\n\n{follow_up}".strip()
    state = append_assistant_message(state, message)
    state = append_down_payment_faq_if_applicable(state, user_text)
    _apply_follow_up_routing(state, follow_up)
    _debug(
        "informative_reply",
        plans=len(plans),
        follow_up=follow_up[:40],
        selected_vehicle_id=selected_vehicle_id,
    )
    return state
