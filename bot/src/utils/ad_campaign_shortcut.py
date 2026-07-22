"""Atajo de campañas Click-to-WhatsApp / Meta ads hacia car_selection."""

from __future__ import annotations

from typing import Any

from src.tools.vehicles import (
    candidates_share_same_model_family,
    fetch_vehicles,
    find_catalog_models_in_text,
    pick_preferred_vehicle,
    resolve_single_vehicle_from_text,
    resolve_vehicles_matching_catalog_models,
)
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


def _ad_field(ad_context: dict[str, Any], key: str) -> str:
    return str(ad_context.get(key) or "").strip()


def _ad_body_matching_text(ad_context: dict[str, Any]) -> str:
    """Body + greeting (sin title), prioritario cuando el title no esta en catalogo."""

    parts: list[str] = []
    for key in ("body", "greetingMessageBody"):
        value = _ad_field(ad_context, key)
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

    state["awaiting_purchase_preferences"] = False
    state["selected_transmission"] = ""
    state["selected_payment_type"] = ""
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


def _activate_full_shortcut(
    state: dict[str, Any],
    vehicle: dict[str, Any],
    *,
    matching_text: str,
    source: str,
) -> bool:
    """Activa atajo completo: selecciona vehiculo y apunta a car_selection."""

    vehicle_id = str(vehicle.get("id") or "").strip()
    if not vehicle_id:
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
    _debug(
        "applied",
        selected_vehicle_id=vehicle_id,
        selected_car=vehicle_name,
        source=source,
        matching_text=matching_text[:200],
    )
    return True


def _resolve_from_text(
    text: str,
    *,
    catalog: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Resuelve vehiculo con filtros LLM y desempate por familia de modelo."""

    cleaned = str(text or "").strip()
    if not cleaned:
        return None
    return resolve_single_vehicle_from_text(
        cleaned,
        prefer_available=True,
        catalog=catalog,
        pick_from_multiple=True,
    )


def _resolve_from_catalog_mentions(
    text: str,
    *,
    catalog: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Fallback determinista: modelos del catalogo mencionados en el texto."""

    candidates = resolve_vehicles_matching_catalog_models(
        text,
        catalog,
        prefer_available=True,
    )
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    # Varios del mismo modelo/familia: elegir uno. Varios modelos distintos: no forzar.
    if candidates_share_same_model_family(candidates):
        return pick_preferred_vehicle(candidates)
    return None


def resolve_vehicle_from_ad_context(
    ad_context: dict[str, Any],
    *,
    catalog: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any] | None, str]:
    """Resuelve vehiculo priorizando body cuando el title no menciona modelo de catalogo."""

    try:
        active_catalog = catalog if isinstance(catalog, list) else fetch_vehicles()
    except Exception:
        return None, "catalog_fetch_failed"

    title = _ad_field(ad_context, "title")
    body_text = _ad_body_matching_text(ad_context)
    full_text = ad_matching_text(ad_context)
    title_models = find_catalog_models_in_text(title, active_catalog) if title else []

    attempts: list[tuple[str, str]] = []
    # Title sin modelo de catalogo (ej. "Suzuki Durango"): priorizar body con Dzire.
    if body_text and not title_models:
        attempts.append(("body_preferred", body_text))
    elif body_text:
        attempts.append(("body", body_text))
    if title and title_models:
        attempts.append(("title", title))
    if full_text:
        attempts.append(("full", full_text))

    seen_texts: set[str] = set()
    for source, text in attempts:
        if text in seen_texts:
            continue
        seen_texts.add(text)
        vehicle = _resolve_from_text(text, catalog=active_catalog)
        if isinstance(vehicle, dict):
            return vehicle, source
        vehicle = _resolve_from_catalog_mentions(text, catalog=active_catalog)
        if isinstance(vehicle, dict):
            return vehicle, f"{source}_catalog_mention"

    return None, "no_match"


def _preserve_ad_vehicle_context(state: dict[str, Any], ad_context: dict[str, Any]) -> bool:
    """Si el atajo falló pero el ad menciona modelo(s) de catalogo, conserva contexto comercial.

    Deja selected_vehicle_id/intent para que el flujo comercial continue tras onboarding.
    """

    try:
        catalog = fetch_vehicles()
    except Exception:
        return False

    title = _ad_field(ad_context, "title")
    body_text = _ad_body_matching_text(ad_context)
    full_text = ad_matching_text(ad_context)
    title_models = find_catalog_models_in_text(title, catalog) if title else []

    # Misma prioridad que el resolver: body si el title no aporta modelo de catalogo.
    focus_text = body_text if (body_text and not title_models) else (body_text or full_text)
    if not focus_text:
        focus_text = full_text
    if not focus_text:
        return False

    models = find_catalog_models_in_text(focus_text, catalog)
    if not models:
        models = find_catalog_models_in_text(full_text, catalog)
    if not models:
        return False

    candidates = resolve_vehicles_matching_catalog_models(
        focus_text if find_catalog_models_in_text(focus_text, catalog) else full_text,
        catalog,
        prefer_available=True,
    )
    if not candidates:
        # Modelo nombrado sin stock: al menos deja el nombre para el flujo posterior.
        state["selected_car"] = models[0]
        state["intent"] = "vehicle_catalog"
        _debug(
            "fallback_model_name_only",
            selected_car=models[0],
            models=models[:5],
        )
        return True

    if len(candidates) == 1 or candidates_share_same_model_family(candidates):
        picked = pick_preferred_vehicle(candidates)
    else:
        # Varios modelos distintos: conserva candidatos para desambiguar tras el nombre.
        state["last_vehicle_candidates"] = candidates[:8]
        state["selected_car"] = format_vehicle_name(candidates[0])
        state["intent"] = "vehicle_catalog"
        _debug(
            "fallback_multi_model_candidates",
            candidate_count=len(candidates),
            models=models[:5],
        )
        return True

    if not isinstance(picked, dict):
        return False
    vehicle_id = str(picked.get("id") or "").strip()
    if not vehicle_id:
        state["selected_car"] = format_vehicle_name(picked) or models[0]
        state["intent"] = "vehicle_catalog"
        return True

    state["selected_vehicle_id"] = vehicle_id
    state["selected_car"] = format_vehicle_name(picked)
    state["intent"] = "vehicle_catalog"
    state["show_selected_vehicle_detail_once"] = True
    state["last_vehicle_candidates"] = []
    _debug(
        "fallback_context_preserved",
        selected_vehicle_id=vehicle_id,
        selected_car=state["selected_car"],
        models=models[:5],
    )
    return True


def apply_ad_campaign_shortcut(state: dict[str, Any], ad_context: dict[str, Any] | None) -> bool:
    """Si el anuncio resuelve un vehiculo, prepara salto a car_selection.

    Aplica en cualquier momento de la sesion (CTWA mid-sesion incluido).
    Si no hay match unico/aplicable pero el ad menciona un modelo de catalogo,
    conserva ese contexto sin saltar el onboarding.

    Returns:
        True si el atajo completo quedo activo en el estado.
    """

    if not can_apply_ad_campaign_shortcut(state, ad_context):
        return False

    assert isinstance(ad_context, dict)
    matching_text = ad_matching_text(ad_context)
    if not matching_text:
        _debug("skip_empty_ad_text")
        return False

    vehicle, source = resolve_vehicle_from_ad_context(ad_context)
    if isinstance(vehicle, dict) and _activate_full_shortcut(
        state,
        vehicle,
        matching_text=matching_text,
        source=source,
    ):
        return True

    if _preserve_ad_vehicle_context(state, ad_context):
        _debug("skip_no_vehicle_match_with_fallback", matching_text=matching_text[:200])
        return False

    _debug("skip_no_vehicle_match", matching_text=matching_text[:200])
    return False
