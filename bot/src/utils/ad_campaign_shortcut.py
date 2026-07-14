"""Atajo de campañas Click-to-WhatsApp / Meta ads hacia car_selection."""

from __future__ import annotations

from typing import Any

from src.tools.vehicles import resolve_single_vehicle_from_text
from src.utils.app_logging import get_app_logger, log_flow_trace
from src.utils.formatters import format_vehicle_name

_log = get_app_logger("ad_campaign_shortcut")

_EARLY_NODES = frozenset({"", "start", "customer_onboarding"})


def _debug(event: str, **payload: Any) -> None:
    log_flow_trace(_log, "ad_campaign_shortcut", event, **payload)


def ad_matching_text(ad_context: dict[str, Any] | None) -> str:
    """Concatena campos del anuncio utiles para resolver un vehiculo."""

    if not isinstance(ad_context, dict) or ad_context.get("isAd") is not True:
        return ""
    parts: list[str] = []
    for key in ("title", "body", "greetingMessageBody"):
        value = str(ad_context.get(key) or "").strip()
        if value:
            parts.append(value)
    return " ".join(parts).strip()


def _has_advanced_commercial_progress(state: dict[str, Any]) -> bool:
    """True si la sesion ya avanzo en catalogo / financiamiento / promo / lead."""

    if str(state.get("selected_vehicle_id") or "").strip():
        return True
    if state.get("lead_capture_done"):
        return True
    if state.get("awaiting_purchase_confirmation"):
        return True
    if state.get("awaiting_financing_plan_selection") or state.get("awaiting_financing_vehicle_selection"):
        return True
    if state.get("awaiting_promotion_selection") or state.get("awaiting_promotion_vehicle_selection"):
        return True
    if state.get("awaiting_promotion_vehicle_interest_confirmation"):
        return True
    if state.get("awaiting_promotion_apply_confirmation"):
        return True
    return False


def can_apply_ad_campaign_shortcut(state: dict[str, Any]) -> bool:
    """Solo al inicio de sesion / onboarding, una vez, sin progreso comercial previo."""

    if state.get("ad_campaign_shortcut_applied"):
        return False
    node = str(state.get("current_node") or "").strip()
    if node not in _EARLY_NODES:
        return False
    if _has_advanced_commercial_progress(state):
        return False
    return True


def apply_ad_campaign_shortcut(state: dict[str, Any], ad_context: dict[str, Any] | None) -> bool:
    """Si el anuncio resuelve un vehiculo unico, prepara salto a car_selection.

    Returns:
        True si el atajo quedo activo en el estado.
    """

    if not isinstance(ad_context, dict) or ad_context.get("isAd") is not True:
        return False

    if not can_apply_ad_campaign_shortcut(state):
        _debug(
            "skip_not_eligible",
            current_node=str(state.get("current_node") or ""),
            already_applied=bool(state.get("ad_campaign_shortcut_applied")),
            selected_vehicle_id=str(state.get("selected_vehicle_id") or ""),
        )
        return False

    matching_text = ad_matching_text(ad_context)
    if not matching_text:
        _debug("skip_empty_ad_text")
        return False

    vehicle = resolve_single_vehicle_from_text(matching_text, prefer_available=True)
    if not isinstance(vehicle, dict):
        _debug("skip_no_vehicle_match", matching_text=matching_text[:200])
        return False

    vehicle_id = str(vehicle.get("id") or "").strip()
    if not vehicle_id:
        _debug("skip_vehicle_without_id", matching_text=matching_text[:200])
        return False

    vehicle_name = format_vehicle_name(vehicle)
    state["selected_vehicle_id"] = vehicle_id
    state["selected_car"] = vehicle_name
    state["intent"] = "vehicle_catalog"
    state["current_node"] = "car_selection"
    state["show_selected_vehicle_detail_once"] = True
    state["ad_campaign_shortcut"] = True
    state["ad_campaign_shortcut_applied"] = True
    state["onboarding_greeting_done"] = True
    state["awaiting_customer_name"] = False
    state["onboarding_turn_complete"] = False
    state["awaiting_purchase_confirmation"] = False
    state["last_vehicle_candidates"] = []
    _debug(
        "applied",
        selected_vehicle_id=vehicle_id,
        selected_car=vehicle_name,
        matching_text=matching_text[:200],
    )
    return True
