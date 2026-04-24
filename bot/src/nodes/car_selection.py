"""Nodo unificado para exploracion, busqueda y seleccion de vehiculos."""

from __future__ import annotations

import os
import re
from typing import Any

from src.state import clientState

from src.services.llm_responses import (
    classify_purchase_confirmation_intent,
    generate_available_models_intro,
    generate_vehicle_detail_intro,
    safe_llm_format,
)
from src.tools.vehicles import (
    canonicalize_with_typo_support,
    detect_vehicle_filters,
    fetch_vehicle_by_id,
    fetch_vehicle_images,
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
_MORE_IMAGES_SIGNALS = {
    "ver mas imagenes",
    "ver más imagenes",
    "ver mas fotos",
    "ver más fotos",
    "mas imagenes",
    "más imagenes",
    "mas fotos",
    "más fotos",
    "siguientes imagenes",
    "siguientes fotos",
}
_FINANCING_SIGNALS = {
    "financiamiento",
    "financiar",
    "financiado",
    "credito",
    "credito automotriz",
    "mensualidad",
    "mensualidades",
    "enganche",
    "tasa",
    "interes",
    "plazo",
    "plan financiero",
    "planes financieros",
    "plan de financiamiento",
    "planes de financiamiento",
    "pagos",
    "plan de pagos",
    "planes de pagos",
}
_PURCHASE_WITH_IMAGES_QUESTION = (
    "¿Te interesa comprar este vehículo o quieres ver más imágenes del mismo? 🚗✨ "
)
_PURCHASE_ONLY_QUESTION = "¿Te interesa comprar este vehículo ? 🚗✨"
_NO_IMAGES_AVAILABLE_MESSAGE = (
    "Lamentablemente no tenemos imagenes de este vehiculo 🥲, "
    "pero puedes ponerte en contacto con un asesor para ver el carro en persona."
)
_NO_MORE_IMAGES_MESSAGE = (
    "Ya no hay mas imagenes de este vehiculo. "
    "Si quieres, te ayudo con otro modelo o continuamos con la compra."
)


def _normalize_signal_set(values: set[str]) -> set[str]:
    """Normaliza señales para compararlas con texto de usuario normalizado."""

    return {normalize_user_text(value) for value in values}


_GENERAL_SIGNALS_NORMALIZED = _normalize_signal_set(_GENERAL_SIGNALS)
_FEATURE_SIGNALS_NORMALIZED = _normalize_signal_set(_FEATURE_SIGNALS)
_MORE_IMAGES_SIGNALS_NORMALIZED = _normalize_signal_set(_MORE_IMAGES_SIGNALS)
_FINANCING_SIGNALS_NORMALIZED = _normalize_signal_set(_FINANCING_SIGNALS)


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


def _is_more_images_request(user_text: str) -> bool:
    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return any(signal in normalized for signal in _MORE_IMAGES_SIGNALS_NORMALIZED)


def _is_financing_request(user_text: str) -> bool:
    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return any(signal in normalized for signal in _FINANCING_SIGNALS_NORMALIZED)


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


def _format_images_block(images: list[str]) -> str:
    if not images:
        return safe_llm_format(_NO_IMAGES_AVAILABLE_MESSAGE)
    formatted = "\n".join(f"- {_image_url_for_chat(url)}" for url in images)
    return f"Imagenes del vehiculo:\n{formatted}"


def _build_purchase_question(include_images_option: bool) -> str:
    if include_images_option:
        return safe_llm_format(_PURCHASE_WITH_IMAGES_QUESTION)
    return safe_llm_format(_PURCHASE_ONLY_QUESTION)


def _build_no_more_images_message() -> str:
    """Genera mensaje cuando no hay mas imagenes por mostrar."""

    return safe_llm_format(_NO_MORE_IMAGES_MESSAGE)


def _append_assistant_blocks(state: clientState, blocks: list[str]) -> clientState:
    for block in blocks:
        cleaned = str(block or "").strip()
        if cleaned:
            append_assistant_message(state, cleaned)
    return state


def _image_url_for_chat(raw_url: str) -> str:
    cleaned = str(raw_url or "").strip()
    if not cleaned:
        return ""
    if cleaned.startswith("http://") or cleaned.startswith("https://"):
        return cleaned
    base = os.getenv("VEHICLES_API_BASE_URL", "http://localhost:4000").rstrip("/")
    if cleaned.startswith("/"):
        return f"{base}{cleaned}"
    return f"{base}/{cleaned}"


def _reset_vehicle_images_state(state: clientState) -> None:
    state["vehicle_images_cursor"] = 0
    state["vehicle_images_has_more"] = False
    state["vehicle_images_last_batch"] = []


def _fetch_top_images_for_selected_vehicle(state: clientState, vehicle_id: str) -> list[str]:
    try:
        payload = fetch_vehicle_images(vehicle_id, mode="top", limit=2)
        images = payload.get("images", [])
        state["vehicle_images_last_batch"] = images if isinstance(images, list) else []
        state["vehicle_images_has_more"] = bool(payload.get("hasMore"))
        next_cursor = payload.get("nextCursor")
        if isinstance(next_cursor, int) and next_cursor >= 0:
            state["vehicle_images_cursor"] = next_cursor
        else:
            state["vehicle_images_cursor"] = len(state["vehicle_images_last_batch"])
        return state["vehicle_images_last_batch"]
    except Exception:
        _debug("top_images_fetch_error", vehicle_id=vehicle_id)
        _reset_vehicle_images_state(state)
        return []


def _respond_with_more_images(state: clientState) -> clientState:
    vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
    if not vehicle_id:
        return append_assistant_message(state, "Primero selecciona un vehiculo para poder mostrarte imagenes.")

    if not state.get("vehicle_images_has_more"):
        return append_assistant_message(
            state,
            _build_no_more_images_message(),
        )

    cursor = state.get("vehicle_images_cursor", 2)
    if not isinstance(cursor, int) or cursor < 0:
        cursor = 2
    try:
        payload = fetch_vehicle_images(vehicle_id, mode="next", cursor=cursor, limit=5)
    except Exception:
        _debug("next_images_fetch_error", vehicle_id=vehicle_id, cursor=cursor)
        return append_assistant_message(state, "No pude obtener mas imagenes en este momento. Intenta nuevamente.")

    images = payload.get("images", [])
    images = images if isinstance(images, list) else []
    state["vehicle_images_last_batch"] = images
    state["vehicle_images_has_more"] = bool(payload.get("hasMore"))
    next_cursor = payload.get("nextCursor")
    if isinstance(next_cursor, int) and next_cursor >= 0:
        state["vehicle_images_cursor"] = next_cursor
    else:
        state["vehicle_images_cursor"] = cursor + len(images)

    if not images:
        return append_assistant_message(
            state,
            "No encontre mas imagenes para este vehiculo. Si quieres, continuamos con la compra o vemos otro modelo.",
        )

    message = _format_images_block(images)
    if state.get("vehicle_images_has_more"):
        message = f"{message}\n\nSi quieres ver mas imagenes, dímelo."
    else:
        message = f"{message}\n\nEstas son todas las imagenes disponibles de este vehiculo."
    return append_assistant_message(state, message)


def _pick_vehicle_from_filters(
    user_text: str,
    vehicles: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Intenta resolver un vehiculo puntual cuando el usuario menciona modelo."""

    filters = detect_vehicle_filters(user_text, vehicles)
    _debug("model_resolution_filters_detected", filters=filters)
    if "model" not in filters and "brand" not in filters:
        return None

    try:
        candidates = search_vehicles(filters)
        _debug("model_resolution_search_results", count=len(candidates), filters=filters)
    except Exception:
        _debug("model_resolution_search_error", filters=filters)
        candidates = []

    if not candidates:
        return None

    available_candidates = [
        item
        for item in candidates
        if isinstance(item, dict) and str(item.get("status", "")).strip().lower() == "available"
    ]
    prioritized = available_candidates or [item for item in candidates if isinstance(item, dict)]
    if len(prioritized) == 1:
        selected = prioritized[0]
        _debug("model_resolution_single_match", selected=_format_vehicle_name(selected))
        return selected

    _debug("model_resolution_ambiguous_matches", count=len(prioritized))
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
    top_images = _fetch_top_images_for_selected_vehicle(state, vehicle_id)
    _debug(
        "vehicle_selected",
        selected_vehicle_id=state["selected_vehicle_id"],
        selected_car=state["selected_car"],
        next_step="awaiting_purchase_confirmation",
    )

    detail_intro = generate_vehicle_detail_intro(state["selected_car"])
    platform = str(state.get("platform", "web")).strip().lower() or "web"
    detail_text = format_vehicle_detail(detail, platform=platform)
    images_block = _format_images_block(top_images)
    if state.get("vehicle_images_has_more"):
        images_block = f"{images_block}\nSi quieres ver mas imagenes, dímelo."
    purchase_question = _build_purchase_question(include_images_option=bool(top_images))
    first_block = f"{detail_intro}\n{detail_text}"
    return _append_assistant_blocks(state, [first_block, images_block, purchase_question])


def _respond_available_list(state: clientState, vehicles: list[dict[str, Any]]) -> clientState:
    state["awaiting_purchase_confirmation"] = False
    state["last_vehicle_candidates"] = [
        item
        for item in vehicles
        if isinstance(item, dict) and str(item.get("status", "")).strip().lower() == "available"
    ][:8]
    state["selected_vehicle_id"] = ""
    state["selected_car"] = ""
    _reset_vehicle_images_state(state)
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
        if _is_financing_request(user_text):
            state["awaiting_purchase_confirmation"] = False
            state["current_node"] = "financing"
            _debug("route_change", next_node="financing", reason="financing_request")
            return state
        previous_bot_message = str(state.get("last_bot_message", "")).strip()
        decision = classify_purchase_confirmation_intent(previous_bot_message, user_text)
        _debug(
            "purchase_confirmation_classified",
            decision=decision,
            selected_car=state.get("selected_car", ""),
        )
        if decision == "VER_MAS_IMAGENES" or _is_more_images_request(user_text):
            return _respond_with_more_images(state)
        if decision == "VER_MODELO":
            selected_vehicle = _pick_vehicle_from_filters(user_text, vehicles)
            if selected_vehicle:
                return _respond_with_vehicle_detail(state, selected_vehicle)
            _debug("model_resolution_no_unique_match")
            return _respond_available_list(state, vehicles)
        if decision == "NO":
            return _respond_available_list(state, vehicles)
        if decision == "SI":
            state["awaiting_purchase_confirmation"] = False
            state["current_node"] = "lead_capture"
            _debug("route_change", next_node="lead_capture")
            return state
        _debug("purchase_confirmation_unknown", user_text=user_text)
        question = _build_purchase_question(include_images_option=bool(state.get("vehicle_images_last_batch")))
        return append_assistant_message(state, question)

    selected_pending = _find_candidate_from_pending(state, user_text)
    if selected_pending:
        _debug("continuing_from_pending_candidates")
        return _respond_with_vehicle_detail(state, selected_pending)

    if _is_general_request(user_text):
        _debug("branch_general_request")
        return _respond_available_list(state, vehicles)

    if _is_financing_request(user_text):
        state["current_node"] = "financing"
        _debug("route_change", next_node="financing", reason="mid_selection_financing")
        return state

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
