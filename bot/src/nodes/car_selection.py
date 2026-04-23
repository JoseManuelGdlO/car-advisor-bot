"""Nodo unificado para exploracion, busqueda y seleccion de vehiculos."""

from __future__ import annotations

import re
from typing import Any

from src.state import clientState

from src.services.llm_responses import (
    classify_purchase_confirmation_intent,
    generate_available_models_intro,
    generate_vehicle_detail_intro,
    generate_vehicle_purchase_question,
    safe_llm_format,
)
from src.tools.vehicles import (
    canonicalize_with_typo_support,
    detect_vehicle_filters,
    fetch_vehicle_by_id,
    fetch_vehicles,
    normalize_user_text,
    search_vehicles,
)
from src.utils.formatters import (
    format_available_vehicles_grouped,
    format_filtered_vehicles,
    format_vehicle_detail,
)
from src.utils.state_helpers import append_assistant_message, latest_user_message

_GENERAL_SIGNALS = {
    "que carros tienes",
    "que autos tienes",
    "carros disponibles",
    "autos disponibles",
    "que marcas",
    "marcas disponibles",
    "catalogo",
    "catálogo",
    "mostrar vehiculos",
    "mostrar vehiculos disponibles",
    "mostrar carros",
}
_FEATURE_SIGNALS = {
    "color",
    "marca",
    "modelo",
    "ano",
    "año",
    "verde",
    "rojo",
    "azul",
    "negro",
    "blanco",
    "gris",
}


def _normalize_signal_set(values: set[str]) -> set[str]:
    """Normaliza señales para compararlas con texto de usuario normalizado."""

    return {normalize_user_text(value) for value in values}


_GENERAL_SIGNALS_NORMALIZED = _normalize_signal_set(_GENERAL_SIGNALS)
_FEATURE_SIGNALS_NORMALIZED = _normalize_signal_set(_FEATURE_SIGNALS)


def _debug(event: str, **payload: Any) -> None:
    """Imprime trazas del flujo para depuracion en consola."""

    if payload:
        pairs = ", ".join(f"{key}={value!r}" for key, value in payload.items())
        print(f"[car_selection] {event} | {pairs}")
        return
    print(f"[car_selection] {event}")


def _is_general_request(user_text: str) -> bool:
    normalized = normalize_user_text(user_text)
    if not normalized:
        return True
    return any(signal in normalized for signal in _GENERAL_SIGNALS_NORMALIZED)


def _looks_like_feature_request(user_text: str) -> bool:
    normalized = normalize_user_text(user_text)
    has_year = bool(re.search(r"\b(?:19|20)\d{2}\b", normalized))
    return has_year or any(signal in normalized for signal in _FEATURE_SIGNALS_NORMALIZED)


def _format_vehicle_name(item: dict[str, Any]) -> str:
    brand = str(item.get("brand", "")).strip()
    model = str(item.get("model", "")).strip()
    year = item.get("year")
    suffix = f" {year}" if isinstance(year, int) else ""
    return f"{brand} {model}{suffix}".strip()


def _find_candidate_from_pending(state: clientState, user_text: str) -> dict[str, Any] | None:
    pending = state.get("last_vehicle_candidates", [])
    if not isinstance(pending, list) or not pending:
        _debug("pending_candidates_empty")
        return None
    options = [_format_vehicle_name(item) for item in pending if isinstance(item, dict)]
    _debug("pending_candidates_detected", options=options)
    picked_label = canonicalize_with_typo_support(user_text, options, threshold=0.72)
    if not picked_label:
        normalized = normalize_user_text(user_text)
        if normalized.isdigit():
            idx = int(normalized) - 1
            if 0 <= idx < len(pending) and isinstance(pending[idx], dict):
                _debug("pending_candidate_selected_by_index", index=idx, value=_format_vehicle_name(pending[idx]))
                return pending[idx]
        _debug("pending_candidate_not_matched", user_text=user_text)
        return None
    for item in pending:
        if not isinstance(item, dict):
            continue
        if _format_vehicle_name(item) == picked_label:
            _debug("pending_candidate_selected_by_name", selected=picked_label)
            return item
    _debug("pending_candidate_label_without_match", picked_label=picked_label)
    return None


def _respond_with_vehicle_detail(state: clientState, vehicle_summary: dict[str, Any]) -> clientState:
    vehicle_id = str(vehicle_summary.get("id", "")).strip()
    _debug("vehicle_detail_requested", vehicle_id=vehicle_id, summary=_format_vehicle_name(vehicle_summary))
    if not vehicle_id:
        _debug("vehicle_detail_missing_id")
        message = safe_llm_format("No pude identificar ese vehiculo. Te muestro disponibles.")
        state["awaiting_purchase_confirmation"] = False
        state["last_vehicle_candidates"] = []
        return append_assistant_message(state, message)
    detail = fetch_vehicle_by_id(vehicle_id)
    if not detail:
        _debug("vehicle_detail_not_found", vehicle_id=vehicle_id)
        message = safe_llm_format(
            "No pude obtener el detalle de ese carro en este momento. Te muestro otras opciones disponibles.",
        )
        state["awaiting_purchase_confirmation"] = False
        state["last_vehicle_candidates"] = []
        return append_assistant_message(state, message)

    state["selected_vehicle_id"] = vehicle_id
    state["selected_car"] = _format_vehicle_name(detail)
    state["last_vehicle_candidates"] = []
    state["awaiting_purchase_confirmation"] = True
    _debug(
        "vehicle_selected",
        selected_vehicle_id=state["selected_vehicle_id"],
        selected_car=state["selected_car"],
        next_step="awaiting_purchase_confirmation",
    )

    detail_intro = generate_vehicle_detail_intro(state["selected_car"])
    platform = str(state.get("platform", "web")).strip().lower() or "web"
    detail_text = format_vehicle_detail(detail, platform=platform)
    purchase_question = generate_vehicle_purchase_question()
    final_text = f"{detail_intro}\n{detail_text}\n\n{purchase_question}"
    return append_assistant_message(state, final_text)


def _respond_available_list(state: clientState, vehicles: list[dict[str, Any]]) -> clientState:
    state["awaiting_purchase_confirmation"] = False
    state["last_vehicle_candidates"] = [
        item
        for item in vehicles
        if isinstance(item, dict) and str(item.get("status", "")).strip().lower() == "available"
    ][:8]
    state["selected_vehicle_id"] = ""
    state["selected_car"] = ""
    available_count = sum(1 for item in vehicles if str(item.get("status", "")).strip().lower() == "available")
    _debug(
        "showing_available_list",
        total_vehicles=len(vehicles),
        available_vehicles=available_count,
        pending_candidates=len(state["last_vehicle_candidates"]),
    )
    available_list = format_available_vehicles_grouped(vehicles)
    if available_list.startswith("No tengo vehiculos disponibles"):
        message = available_list
    else:
        intro = generate_available_models_intro()
        message = f"{intro}\n{available_list}"
    return append_assistant_message(state, message)


def car_selection(state: clientState) -> clientState:
    """Unifica listado general, filtros por caracteristica y detalle por carro."""

    state["current_node"] = "car_selection"
    if state.get("skip_car_prompt"):
        state["skip_car_prompt"] = False
        _debug("skip_car_prompt_active", action="skip_node_execution")
        return state

    user_text = latest_user_message(state)
    normalized_text = normalize_user_text(user_text)
    _debug(
        "entry",
        user_text=user_text,
        normalized_text=normalized_text,
        awaiting_purchase_confirmation=bool(state.get("awaiting_purchase_confirmation")),
        has_pending_candidates=bool(state.get("last_vehicle_candidates")),
    )

    try:
        vehicles = fetch_vehicles()
        _debug("catalog_loaded", total_vehicles=len(vehicles))
    except Exception:
        _debug("catalog_fetch_error")
        message = safe_llm_format(
            "No pude consultar el catalogo en este momento. Intenta nuevamente en unos segundos.",
        )
        return append_assistant_message(state, message)

    if state.get("awaiting_purchase_confirmation"):
        previous_bot_message = str(state.get("last_bot_message", "")).strip()
        decision = classify_purchase_confirmation_intent(previous_bot_message, user_text)
        _debug(
            "purchase_confirmation_classified",
            decision=decision,
            selected_car=state.get("selected_car", ""),
        )
        if decision in {"NO", "VER_MODELO"}:
            return _respond_available_list(state, vehicles)
        if decision == "SI":
            state["awaiting_purchase_confirmation"] = False
            state["current_node"] = "lead_capture"
            _debug("route_change", next_node="lead_capture")
            return state
        _debug("purchase_confirmation_unknown", user_text=user_text)
        question = generate_vehicle_purchase_question()
        return append_assistant_message(state, question)

    selected_pending = _find_candidate_from_pending(state, user_text)
    if selected_pending:
        _debug("continuing_from_pending_candidates")
        return _respond_with_vehicle_detail(state, selected_pending)

    if _is_general_request(user_text):
        _debug("branch_general_request")
        return _respond_available_list(state, vehicles)

    filters = detect_vehicle_filters(user_text, vehicles)
    _debug("filters_detected", filters=filters)
    if filters:
        try:
            filtered = search_vehicles(filters)
            _debug("search_results", count=len(filtered), filters=filters)
        except Exception:
            _debug("search_error", filters=filters)
            filtered = []
        if not filtered:
            _debug("search_empty", filters=filters)
            message = safe_llm_format(
                "No encontre carros con esas caracteristicas. Quieres que te muestre todos los disponibles?",
            )
            return append_assistant_message(state, message)
        if len(filtered) == 1:
            _debug("search_single_match", match=_format_vehicle_name(filtered[0]))
            return _respond_with_vehicle_detail(state, filtered[0])
        if _looks_like_feature_request(user_text):
            _debug("search_multiple_feature_request", count=len(filtered))
            message = format_filtered_vehicles(filtered)
            message = f"{message}\n\nSi te interesa uno, dime la marca y modelo exactos."
        else:
            _debug("search_multiple_specific_request", count=len(filtered))
            message = safe_llm_format(
                "Encontre varios carros parecidos. Cual te interesa? Puedes responder con el nombre o numero.",
            )
        state["last_vehicle_candidates"] = filtered[:8]
        _debug("pending_candidates_saved", count=len(state["last_vehicle_candidates"]))
        return append_assistant_message(state, message)

    _debug("no_filters_detected_fallback_to_available")
    return _respond_available_list(state, vehicles)
