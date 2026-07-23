"""Nodo de promociones: respuesta informativa (estilo FAQ) sin seleccion de promo."""

from __future__ import annotations

from typing import Any

from src.services.car_selection_fallback import is_financing_request
from src.state import clientState
from src.tools.database import (
    fetch_promotions,
    fetch_promotions_by_vehicle,
    persist_commercial_selection_to_backend,
)
from src.tools.vehicles import normalize_user_text
from src.utils.app_logging import get_app_logger, log_flow_trace
from src.utils.formatters import format_promotions
from src.utils.purchase_flow_messages import (
    CONTACT_PREFERENCE_MESSAGE,
    FAQ_SOFT_CATALOG_CLOSE,
    PURCHASE_PREFERENCES_REASK_BOTH,
    commercial_info_follow_up,
)
from src.utils.signals import FINANCING_SIGNALS
from src.utils.state_helpers import append_assistant_message, latest_user_message

_log = get_app_logger("promotions")

_FINANCING_SIGNALS_NORMALIZED = {normalize_user_text(s) for s in FINANCING_SIGNALS}

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
    """Trazas de depuracion; payload completo solo con LOG_LEVEL=debug."""

    log_flow_trace(_log, "promotions", event, **payload)


def _clear_selection_flags(state: clientState) -> None:
    state["awaiting_promotion_selection"] = False
    state["awaiting_promotion_apply_confirmation"] = False
    state["awaiting_promotion_vehicle_selection"] = False
    state["awaiting_promotion_vehicle_interest_confirmation"] = False
    state["promotion_candidates"] = []
    state["promotion_vehicle_candidates"] = []
    state["pending_financing_after_promotion"] = False


def _wants_other_vehicles(user_text: str) -> bool:
    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return any(signal in normalized for signal in _OTHER_VEHICLES_SIGNALS)


def _filter_active_promotions(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        if not bool(item.get("active", True)):
            continue
        if not str(item.get("title", "")).strip():
            continue
        out.append(item)
    return out


def _set_primary_promotion(state: clientState, promo: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(promo, dict):
        state["selected_promotion_id"] = ""
        state["selected_promotion_title"] = ""
        state["selected_promotion_description"] = ""
        state["selected_promotion_valid_until"] = ""
        state["selected_promotion_vehicle_ids"] = []
        return {}
    promo_id = str(promo.get("id", "")).strip()
    title = str(promo.get("title", "")).strip()
    description = str(promo.get("description", "")).strip()
    valid_until = str(promo.get("validUntil", "")).strip()
    vehicle_ids = promo.get("vehicleIds")
    if not isinstance(vehicle_ids, list):
        vehicle_ids = promo.get("vehicle_ids")
    if not isinstance(vehicle_ids, list):
        vehicle_ids = []
    state["selected_promotion_id"] = promo_id
    state["selected_promotion_title"] = title
    state["selected_promotion_description"] = description
    state["selected_promotion_valid_until"] = valid_until
    state["selected_promotion_vehicle_ids"] = vehicle_ids
    selected_car = str(state.get("selected_car", "")).strip()
    selection = {
        "promotion_id": promo_id,
        "title": title,
        "description": description,
        "valid_until": valid_until,
        "vehicle_ids": vehicle_ids,
        "vehicle_id": str(state.get("selected_vehicle_id", "")).strip(),
        "vehicle_name": selected_car,
    }
    if not (selection["promotion_id"] or selection["title"] or selection["description"]):
        return {}
    return selection


def _apply_follow_up_routing(state: clientState, follow_up: str) -> None:
    """Deja flags listos para el siguiente turno; current_node=router para terminar el invoke."""

    state["intent"] = "vehicle_catalog"
    state["current_node"] = "router"
    if follow_up == PURCHASE_PREFERENCES_REASK_BOTH:
        state["awaiting_purchase_preferences"] = True
        return
    if follow_up == CONTACT_PREFERENCE_MESSAGE:
        state["awaiting_purchase_confirmation"] = True
        state["awaiting_purchase_preferences"] = False
        return
    if follow_up == FAQ_SOFT_CATALOG_CLOSE and not str(state.get("selected_car", "")).strip():
        state["awaiting_purchase_confirmation"] = False


def promotions(state: clientState) -> clientState:
    """Muestra promociones de forma informativa y empuja el flujo comercial con un follow-up."""

    if state.get("suppress_commercial_node_once"):
        state["suppress_commercial_node_once"] = False
        _debug("suppressed_once")
        return state

    state["current_node"] = "promotions"
    state["intent"] = "promotions"
    user_text = latest_user_message(state)
    _clear_selection_flags(state)

    if is_financing_request(user_text, _FINANCING_SIGNALS_NORMALIZED):
        state["current_node"] = "financing"
        state["intent"] = "financing"
        _debug("hop_to_financing")
        return state

    if _wants_other_vehicles(user_text):
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        _debug("hop_to_car_selection_other_vehicles")
        return state

    selected_vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
    platform = str(state.get("platform", "web")).strip().lower() or "web"

    promos: list[dict[str, Any]] = []
    if selected_vehicle_id:
        try:
            promos = fetch_promotions_by_vehicle(selected_vehicle_id)
        except Exception:
            _debug("promos_for_vehicle_fetch_error", selected_vehicle_id=selected_vehicle_id)
            promos = []
        promos = _filter_active_promotions(promos)
        if not promos:
            try:
                promos = fetch_promotions()
            except Exception:
                _debug("promos_global_fallback_fetch_error")
                promos = []
            promos = _filter_active_promotions(promos)
    else:
        try:
            promos = fetch_promotions()
        except Exception:
            _debug("promos_global_fetch_error")
            promos = []
        promos = _filter_active_promotions(promos)

    listing = format_promotions(promos, platform=platform)
    primary = promos[0] if promos else None
    promotion_selection = _set_primary_promotion(state, primary)
    if promotion_selection:
        persist_commercial_selection_to_backend(
            state,
            promotion_selection=promotion_selection,
            message=f"Consulta de promociones: {promotion_selection.get('title') or 'promo'}",
        )

    follow_up = commercial_info_follow_up(state)
    message = f"{listing}\n\n{follow_up}".strip()
    state = append_assistant_message(state, message)
    _apply_follow_up_routing(state, follow_up)
    _debug(
        "informative_reply",
        promotions=len(promos),
        follow_up=follow_up[:40],
        selected_vehicle_id=selected_vehicle_id,
    )
    return state
