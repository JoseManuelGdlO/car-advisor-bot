"""Atajo de campañas Click-to-WhatsApp / Meta ads hacia car_selection."""

from __future__ import annotations

from typing import Any

from src.tools.vehicles import resolve_single_vehicle_from_text
from src.utils.app_logging import get_app_logger, log_flow_trace
from src.utils.formatters import format_vehicle_name

_log = get_app_logger("ad_campaign_shortcut")


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


def can_apply_ad_campaign_shortcut(
    state: dict[str, Any],
    ad_context: dict[str, Any] | None = None,
) -> bool:
    """True si el turno trae un anuncio valido (isAd); no depende del nodo ni del progreso."""

    _ = state
    return isinstance(ad_context, dict) and ad_context.get("isAd") is True


def _reset_commercial_progress_for_ad(state: dict[str, Any]) -> None:
    """Limpia flags/candidatos mid-sesion para dejar el turno en ficha de vehiculo."""

    state["awaiting_purchase_confirmation"] = False
    state["awaiting_financing_plan_selection"] = False
    state["awaiting_financing_vehicle_selection"] = False
    state["awaiting_promotion_selection"] = False
    state["awaiting_promotion_vehicle_selection"] = False
    state["awaiting_promotion_vehicle_interest_confirmation"] = False
    state["awaiting_promotion_apply_confirmation"] = False
    state["pending_financing_after_promotion"] = False
    state["financing_plan_candidates"] = []
    state["financing_vehicle_candidates"] = []
    state["promotion_candidates"] = []
    state["promotion_vehicle_candidates"] = []
    state["last_vehicle_candidates"] = []
    state["selected_financing_plan_id"] = ""
    state["selected_financing_plan_name"] = ""
    state["selected_financing_plan_lender"] = ""
    state["selected_promotion_id"] = ""
    state["selected_promotion_title"] = ""
    state["selected_promotion_description"] = ""
    state["selected_promotion_valid_until"] = ""
    state["selected_promotion_vehicle_ids"] = []
    state["vehicle_images_cursor"] = 0
    state["vehicle_images_has_more"] = False
    state["vehicle_images_last_batch"] = []
    state["technical_sheet_delivered_vehicle_id"] = ""


def apply_ad_campaign_shortcut(state: dict[str, Any], ad_context: dict[str, Any] | None) -> bool:
    """Si el anuncio resuelve un vehiculo unico, prepara salto a car_selection.

    Aplica en cualquier momento de la sesion (CTWA mid-sesion incluido).

    Returns:
        True si el atajo quedo activo en el estado.
    """

    if not can_apply_ad_campaign_shortcut(state, ad_context):
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
    _reset_commercial_progress_for_ad(state)
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
    _debug(
        "applied",
        selected_vehicle_id=vehicle_id,
        selected_car=vehicle_name,
        matching_text=matching_text[:200],
    )
    return True
