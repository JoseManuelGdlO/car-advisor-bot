"""Nodo unificado para exploracion, busqueda y seleccion de vehiculos."""

from __future__ import annotations

import json
import re
from typing import Any

from src.state import clientState

from src.services.llm_responses import (
    _coerce_to_bool,
    classify_contact_method,
    classify_purchase_confirmation_intent,
    classify_purchase_preferences,
    classify_vehicle_comparison_payload,
    classify_vehicle_requirement_matches,
    classify_vehicle_step_flags,
    extract_vehicle_pending_selection_payload,
    generate_selected_vehicle_qa_response,
    generate_vehicle_candidates_selection_message,
    generate_vehicle_comparison_conversation,
    generate_vehicle_detail_conversation,
    generate_verified_user_message,
)
from src.services.car_selection_fallback import (
    detect_contact_method,
    detect_payment_type_preference,
    detect_transmission_preference,
    is_cheapest_price_request,
    is_financing_request,
    is_first_images_request,
    is_general_request,
    is_more_images_request,
    is_promotions_request,
    is_selected_vehicle_specs_request,
    is_test_drive_or_visit_request,
    looks_like_feature_request,
    looks_like_specific_vehicle_request,
    user_asks_for_color,
    user_asks_for_dimensions,
    user_asks_for_technical_sheet,
)
from src.tools.vehicles import (
    _coerce_price,
    _extract_price_filters,
    canonicalize_with_typo_support,
    detect_vehicle_filters,
    fetch_vehicle_by_id,
    fetch_vehicle_images,
    fetch_vehicles,
    normalize_user_text,
    search_vehicles,
)
from src.utils.purchase_flow_messages import CONTACT_PREFERENCE_MESSAGE
from src.utils.formatters import (
    format_available_vehicles_grouped,
    format_candidate_options,
    format_filtered_vehicles,
    format_two_vehicle_comparison_grounding,
    format_vehicle_name,
    format_vehicle_detail,
    sort_vehicles_by_outbound_priority,
)
from src.utils.signals import (
    CHEAPEST_PRICE_SIGNALS,
    FEATURE_SIGNALS,
    FINANCING_SIGNALS,
    FIRST_IMAGES_SIGNALS,
    GENERAL_SIGNALS,
    MORE_IMAGES_SIGNALS,
    NO_MORE_IMAGES_MESSAGE,
    PROMOTIONS_SIGNALS,
    TEST_DRIVE_VISIT_SIGNALS,
)
from src.utils.vehicle_images import (
    build_vehicle_images_message,
    build_whatsapp_images_block,
    fetch_top_images_for_vehicle,
    format_images_block_for_chat,
    reset_vehicle_images_state,
)
from src.utils.whatsapp_markers import build_whatsapp_document_marker_block, normalize_image_url_for_chat
from src.utils.app_logging import get_app_logger, log_flow_trace
from src.utils.state_helpers import append_assistant_message, latest_user_message

_log = get_app_logger("car_selection")


def _normalize_signal_set(values: set[str]) -> set[str]:
    """Normaliza señales para compararlas con texto de usuario normalizado."""

    return {normalize_user_text(value) for value in values}


_GENERAL_SIGNALS_NORMALIZED = _normalize_signal_set(GENERAL_SIGNALS)
_FEATURE_SIGNALS_NORMALIZED = _normalize_signal_set(FEATURE_SIGNALS)
_CHEAPEST_PRICE_SIGNALS_NORMALIZED = _normalize_signal_set(CHEAPEST_PRICE_SIGNALS)
_FINANCING_SIGNALS_NORMALIZED = _normalize_signal_set(FINANCING_SIGNALS)
_PROMOTIONS_SIGNALS_NORMALIZED = _normalize_signal_set(PROMOTIONS_SIGNALS)
_TEST_DRIVE_VISIT_SIGNALS_NORMALIZED = _normalize_signal_set(TEST_DRIVE_VISIT_SIGNALS)
_FIRST_IMAGES_SIGNALS_NORMALIZED = _normalize_signal_set(FIRST_IMAGES_SIGNALS)
_MORE_IMAGES_SIGNALS_NORMALIZED = _normalize_signal_set(MORE_IMAGES_SIGNALS)


def _debug(event: str, **payload: Any) -> None:
    """Trazas del flujo; payload completo solo con LOG_LEVEL=debug."""

    log_flow_trace(_log, "car_selection", event, **payload)


def _user_asks_images_heuristically(user_text: str) -> bool:
    """True si hay señal heuristica de pedido de fotos (primer lote o mas)."""

    if is_first_images_request(
        user_text,
        _FIRST_IMAGES_SIGNALS_NORMALIZED,
        more_images_signals_normalized=_MORE_IMAGES_SIGNALS_NORMALIZED,
    ):
        return True
    return is_more_images_request(user_text, _MORE_IMAGES_SIGNALS_NORMALIZED)


def _message_is_purchase_prefs_without_images(user_text: str) -> bool:
    """True si el mensaje indica transmision/pago y no pide fotos explicitamente."""

    has_transmission = detect_transmission_preference(user_text) is not None
    has_payment = detect_payment_type_preference(user_text) is not None
    if not (has_transmission or has_payment):
        return False
    return not _user_asks_images_heuristically(user_text)


def _effective_vehicle_image_flags(user_text: str, flags: dict[str, Any]) -> dict[str, bool]:
    """Aplica guardrail: preferencias de compra sin señales de fotos no disparan imagenes."""

    ask_images = _coerce_to_bool(flags.get("ask_images"))
    ask_more_images = _coerce_to_bool(flags.get("ask_more_images"))
    if not (ask_images or ask_more_images):
        return {"ask_images": False, "ask_more_images": False}
    if _message_is_purchase_prefs_without_images(user_text):
        _debug(
            "image_flags_suppressed_purchase_prefs",
            user_text=user_text,
            ask_images=ask_images,
            ask_more_images=ask_more_images,
        )
        return {"ask_images": False, "ask_more_images": False}
    return {"ask_images": ask_images, "ask_more_images": ask_more_images}


def _llm_vehicle_image_flags(
    *,
    user_text: str,
    previous_bot_message: str,
    selected_car_name: str,
) -> dict[str, bool]:
    """Detecta pedidos de imagenes via clasificador LLM del paso de vehiculo."""

    vehicle_flags = classify_vehicle_step_flags(previous_bot_message, user_text, selected_car_name)
    return _effective_vehicle_image_flags(user_text, vehicle_flags)


PendingSelectionResult = dict[str, Any] | list[dict[str, Any]] | None


def _pending_matches_for_name_query(
    name_query: str,
    pending: list[dict[str, Any]],
    options: list[str],
) -> list[dict[str, Any]]:
    """Busca candidatos cuyo nombre contiene el fragmento indicado por el usuario."""

    name_q = normalize_user_text(name_query)
    if not name_q:
        return []
    matches: list[dict[str, Any]] = []
    for item, label in zip(pending, options):
        if not isinstance(item, dict):
            continue
        normalized_label = normalize_user_text(label)
        if not normalized_label:
            continue
        if name_q in normalized_label or normalized_label in name_q:
            matches.append(item)
            continue
        parts = [part for part in name_q.split() if part]
        if parts and all(
            re.search(rf"(?<![a-z0-9]){re.escape(part)}(?![a-z0-9])", normalized_label) for part in parts
        ):
            matches.append(item)
    if matches:
        return matches
    picked_label = canonicalize_with_typo_support(name_query, options, threshold=0.72)
    if not picked_label:
        return []
    for item in pending:
        if isinstance(item, dict) and format_vehicle_name(item) == picked_label:
            return [item]
    return []


def _resolve_pending_vehicle_from_extract(
    pending: list[dict[str, Any]],
    options: list[str],
    payload: dict[str, Any],
) -> PendingSelectionResult:
    """Mapea salida JSON del extractor LLM a un vehiculo pendiente (o lista si hay ambiguedad)."""

    if not pending or not isinstance(payload, dict):
        return None
    if payload.get("no_match") is True:
        return None
    raw_idx = payload.get("vehicle_index")
    if isinstance(raw_idx, (int, float)) and not isinstance(raw_idx, bool) and int(raw_idx) == raw_idx:
        i = int(raw_idx) - 1
        if 0 <= i < len(pending) and isinstance(pending[i], dict):
            return pending[i]
    name_q = str(payload.get("name_query") or "").strip()
    if not name_q:
        return None
    matches = _pending_matches_for_name_query(name_q, pending, options)
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        return matches
    return None


def _respond_pending_selection_clarification(
    state: clientState,
    ambiguous_matches: list[dict[str, Any]],
) -> clientState:
    """Re-pregunta cuando el usuario alude a varios candidatos pendientes a la vez."""

    state["last_vehicle_candidates"] = _top_vehicle_candidates(ambiguous_matches)
    options = format_candidate_options(ambiguous_matches)
    user_text = latest_user_message(state)
    message = (
        generate_vehicle_candidates_selection_message(options, user_message=user_text)
        if options
        else generate_verified_user_message(
            mode="operational",
            verified_facts_block="situacion: seleccion_vehiculo_ambigua\n",
            user_message=user_text,
            fallback=(
                "Encontre varios carros que podrian coincidir. "
                "¿Cual te interesa? Puedes responder con el nombre o el numero."
            ),
            temperature=0.35,
        )
    )
    _debug("pending_candidate_ambiguous_clarification", count=len(ambiguous_matches))
    return append_assistant_message(state, message)


def _find_candidate_from_pending(state: clientState, user_text: str) -> PendingSelectionResult:
    """Resuelve selección del usuario contra candidatos pendientes (nombre, índice o LLM)."""
    pending = state.get("last_vehicle_candidates", [])
    if not isinstance(pending, list) or not pending:
        _debug("pending_candidates_empty")
        return None
    dict_pending = [item for item in pending if isinstance(item, dict)]
    if not dict_pending:
        _debug("pending_candidates_empty")
        return None
    options = [format_vehicle_name(item) for item in dict_pending]
    _debug("pending_candidates_detected", options=options)
    picked_label = canonicalize_with_typo_support(user_text, options, threshold=0.72)
    if picked_label:
        for item in dict_pending:
            if format_vehicle_name(item) == picked_label:
                _debug("pending_candidate_selected_by_name", selected=picked_label)
                return item
        _debug("pending_candidate_label_without_match", picked_label=picked_label)
        return None

    normalized = normalize_user_text(user_text)
    # Evita falsas selecciones por digitos que son parte del nombre del modelo, no el indice de lista:
    # solo usamos seleccion por indice cuando el usuario realmente esta eligiendo opcion.
    explicit_index_selection = bool(
        re.fullmatch(r"\d{1,2}", normalized)
        or re.search(
            r"\b(opcion|opción|numero|número|num|elijo|selecciono|me quedo con|quiero la|quiero el)\b",
            normalized,
        )
    )
    index_match = re.search(r"\b(\d{1,2})\b", normalized)
    if explicit_index_selection and index_match:
        idx = int(index_match.group(1)) - 1
        if 0 <= idx < len(dict_pending):
            _debug(
                "pending_candidate_selected_by_index",
                index=idx,
                value=format_vehicle_name(dict_pending[idx]),
            )
            return dict_pending[idx]

    numbered = format_candidate_options(dict_pending)
    if not numbered.strip():
        _debug("pending_candidate_not_matched", user_text=user_text)
        return None
    payload = extract_vehicle_pending_selection_payload(
        previous_bot_message=str(state.get("last_bot_message", "")).strip(),
        user_message=user_text,
        numbered_candidate_lines=numbered,
    )
    resolved = _resolve_pending_vehicle_from_extract(dict_pending, options, payload)
    if isinstance(resolved, dict):
        _debug(
            "pending_candidate_selected_by_llm",
            selected=format_vehicle_name(resolved),
            payload=payload,
        )
        return resolved
    if isinstance(resolved, list):
        _debug("pending_candidate_ambiguous_from_llm", count=len(resolved), payload=payload)
        return resolved
    _debug("pending_candidate_not_matched", user_text=user_text, llm_payload=payload)
    return None


def _format_images_block(images: list[str]) -> str:
    """Renderiza bloque de imágenes en texto para canales no-WhatsApp."""
    return format_images_block_for_chat(images, resolve_url_fn=_image_url_for_chat)


def _build_whatsapp_image_marker_block(state: clientState, vehicle_id: str, images: list[str]) -> str:
    """Genera marcadores JSON para envío de imágenes por WhatsApp."""
    return build_whatsapp_images_block(state, vehicle_id, images)


_CONTACT_METHOD_LABEL_TO_VALUE = {
    "WHATSAPP": "whatsapp",
    "CALL": "call",
    "APPOINTMENT": "appointment",
}


def _build_purchase_question(state: clientState) -> str:
    """Mensaje fijo de preferencia de contacto post-detalle."""

    _ = state  # firma estable para callers existentes
    return CONTACT_PREFERENCE_MESSAGE


def _resolve_contact_method(user_text: str, previous_bot_message: str) -> str:
    """Heuristica primero; LLM si falta o hay conflicto. Devuelve whatsapp|call|appointment|''."""

    heuristic = detect_contact_method(user_text)
    if heuristic and heuristic != "conflict":
        return heuristic
    classified = classify_contact_method(previous_bot_message, user_text)
    return _CONTACT_METHOD_LABEL_TO_VALUE.get(classified, "")


def _route_to_lead_capture(state: clientState, *, contact_method: str, reason: str) -> clientState:
    """Cierra confirmacion, guarda metodo de contacto y enruta a lead_capture."""

    state["awaiting_purchase_confirmation"] = False
    state["contact_method"] = contact_method
    state["current_node"] = "lead_capture"
    state["intent"] = "lead_capture"
    _debug("route_change", next_node="lead_capture", reason=reason, contact_method=contact_method)
    return state


def _build_purchase_preferences_message(selected_car: str) -> str:
    """Mensaje fijo post-seleccion: transmision + forma de pago (sin LLM)."""

    model = str(selected_car or "").strip() or "modelo elegido"
    return (
        f"¡Excelente elección! El {model} tenemos excelentes promociones este mes.\n"
        "Ya tengo la ficha lista para ti.\n"
        "Solo 2 datos rápidos para mandarte la versión correcta:\n\n"
        "1. ¿Lo buscas Automático o Estándar?\n"
        "2. ¿Sería de contado o financiado?\n"
        "Por favor contesta ambas preguntas en un mismo mensaje"
    )


def _build_purchase_preferences_reask_message(
    *,
    need_transmission: bool,
    need_payment: bool,
) -> str:
    """Repregunta fija solo por los campos faltantes."""

    if need_transmission and need_payment:
        return (
            "Necesito ambos datos en un mismo mensaje:\n"
            "1. ¿Lo buscas Automático o Estándar?\n"
            "2. ¿Sería de contado o financiado?"
        )
    if need_transmission:
        return "Me falta un dato: ¿lo buscas Automático o Estándar?"
    return "Me falta un dato: ¿sería de contado o financiado?"


def _clear_purchase_preferences(state: clientState) -> None:
    """Limpia preferencias post-seleccion y su bandera de espera."""

    state["awaiting_purchase_preferences"] = False
    state["selected_transmission"] = ""
    state["selected_payment_type"] = ""


def _normalize_preference_value(value: str | None, *, kind: str) -> str:
    """Normaliza etiquetas de preferencia a valores de estado o cadena vacia."""

    raw = str(value or "").strip().lower()
    if kind == "transmission":
        if raw in {"automatico", "automatic"}:
            return "automatico"
        if raw in {"estandar", "standard", "manual"}:
            return "estandar"
        return ""
    if raw in {"contado", "cash"}:
        return "contado"
    if raw in {"financiado", "financing"}:
        return "financiado"
    return ""


def _resolve_purchase_preferences(
    user_text: str,
    previous_bot_message: str,
) -> tuple[str, str]:
    """Resuelve transmision y pago: heuristica primero, LLM si falta o hay conflicto."""

    transmission_h = detect_transmission_preference(user_text)
    payment_h = detect_payment_type_preference(user_text)
    transmission = _normalize_preference_value(
        transmission_h if transmission_h not in {None, "conflict"} else "",
        kind="transmission",
    )
    payment = _normalize_preference_value(
        payment_h if payment_h not in {None, "conflict"} else "",
        kind="payment",
    )
    needs_llm = (
        transmission_h in {None, "conflict"}
        or payment_h in {None, "conflict"}
    )
    if not needs_llm:
        return transmission, payment

    classified = classify_purchase_preferences(previous_bot_message, user_text)
    if not transmission:
        transmission = _normalize_preference_value(
            str(classified.get("transmission", "")).lower(),
            kind="transmission",
        )
    if not payment:
        payment = _normalize_preference_value(
            str(classified.get("payment_type", "")).lower(),
            kind="payment",
        )
    return transmission, payment


def _build_no_more_images_message() -> str:
    """Genera mensaje cuando no hay mas imagenes por mostrar."""

    return generate_verified_user_message(
        mode="operational",
        verified_facts_block=(
            "tipo: sin_mas_imagenes\n"
            f"texto_literal_sistema: {NO_MORE_IMAGES_MESSAGE}\n"
            "prohibido: fechas, horas, dias, lugar, coordinar agenda\n"
            "solo_pregunta_interes: si\n"
        ),
        user_message="",
        fallback=NO_MORE_IMAGES_MESSAGE,
        temperature=0.35,
    )


def _append_assistant_blocks(state: clientState, blocks: list[str]) -> clientState:
    """Agrega assistant blocks al estado sin sobrescribir historial."""
    for block in blocks:
        cleaned = str(block or "").strip()
        if cleaned:
            append_assistant_message(state, cleaned)
    return state


def _image_url_for_chat(raw_url: str) -> str:
    """Normaliza URL de imagen relativa/absoluta al host backend."""
    return normalize_image_url_for_chat(raw_url)


def _reset_vehicle_images_state(state: clientState) -> None:
    """Reinicia vehicle images state para evitar residuos de estado."""
    reset_vehicle_images_state(state)


def _reset_technical_sheet_delivery(state: clientState) -> None:
    """Limpia el tracking de ficha tecnica enviada (cambio o descarte de vehiculo)."""
    state["technical_sheet_delivered_vehicle_id"] = ""


def _mark_technical_sheet_delivered(state: clientState, vehicle_id: str) -> None:
    """Registra que ya se entrego la ficha tecnica PDF para este vehiculo."""
    normalized = str(vehicle_id or "").strip()
    if normalized:
        state["technical_sheet_delivered_vehicle_id"] = normalized


def _should_attach_technical_sheet(
    state: clientState,
    vehicle_id: str,
    user_text: str,
    *,
    with_images: bool = False,
) -> bool:
    """True si pide la ficha PDF, o si va con imagenes y aun no se entrego para este vehiculo."""
    current_id = str(vehicle_id or "").strip()
    if not current_id:
        return False
    if user_asks_for_technical_sheet(user_text):
        return True
    if not with_images:
        return False
    already_delivered = str(state.get("technical_sheet_delivered_vehicle_id", "")).strip() == current_id
    return not already_delivered


def _append_technical_sheet_if_needed(
    state: clientState,
    blocks: list[str],
    *,
    user_text: str,
    with_images: bool = False,
    detail: dict[str, Any] | None = None,
) -> None:
    """Adjunta el PDF de ficha tecnica a blocks cuando el gating lo permite."""
    vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
    if isinstance(detail, dict):
        detail_id = str(detail.get("id", "")).strip()
        if detail_id:
            vehicle_id = detail_id
    if not _should_attach_technical_sheet(state, vehicle_id, user_text, with_images=with_images):
        return
    resolved = detail if isinstance(detail, dict) else fetch_vehicle_by_id(vehicle_id)
    if not isinstance(resolved, dict):
        return
    sheet_msg = _build_technical_sheet_message(state, resolved)
    if sheet_msg:
        blocks.append(sheet_msg)


def _respond_with_first_images(state: clientState) -> clientState:
    """Entrega primer lote de imágenes del vehículo seleccionado (y ficha PDF si aplica)."""

    vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
    if not vehicle_id:
        return append_assistant_message(state, "Primero selecciona un vehiculo para poder mostrarte imagenes.")

    images = fetch_top_images_for_vehicle(state, vehicle_id, limit=2)
    _debug("first_images_fetched", vehicle_id=vehicle_id, count=len(images))
    message = build_vehicle_images_message(
        state,
        vehicle_id,
        images,
        format_block_fn=_format_images_block,
        whatsapp_block_fn=_build_whatsapp_image_marker_block,
    )
    blocks = [message]
    _append_technical_sheet_if_needed(
        state,
        blocks,
        user_text=latest_user_message(state),
        with_images=True,
    )
    return _append_assistant_blocks(state, blocks)


def _respond_with_more_images(state: clientState) -> clientState:
    """Entrega lote siguiente de imágenes y actualiza cursores de paginación."""
    vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
    if not vehicle_id:
        return append_assistant_message(state, "Primero selecciona un vehiculo para poder mostrarte imagenes.")

    if not state.get("vehicle_images_last_batch"):
        return _respond_with_first_images(state)

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
            "No encontre mas imagenes para este vehiculo. Si te interesa, podemos avanzar con una prueba de manejo "
            "o para que veas el vehiculo en persona; tambien puedo mostrarte otro modelo.",
        )

    message = build_vehicle_images_message(
        state,
        vehicle_id,
        images,
        format_block_fn=_format_images_block,
        whatsapp_block_fn=_build_whatsapp_image_marker_block,
    )
    blocks = [message]
    _append_technical_sheet_if_needed(
        state,
        blocks,
        user_text=latest_user_message(state),
        with_images=True,
    )
    return _append_assistant_blocks(state, blocks)


def _build_technical_sheet_message(state: clientState, detail: dict[str, Any]) -> str:
    """Arma mensaje de ficha técnica: documento nativo en WhatsApp, URL en web."""

    url = str(detail.get("technicalSheetUrl") or "").strip()
    if not url:
        return ""
    platform = str(state.get("platform", "web")).strip().lower() or "web"
    absolute = normalize_image_url_for_chat(url)
    file_name = url.split("/")[-1] or "ficha-tecnica.pdf"
    vehicle_id = str(detail.get("id", state.get("selected_vehicle_id", ""))).strip()
    if platform == "whatsapp":
        user_id = str(state.get("user_id", "")).strip()
        message = build_whatsapp_document_marker_block(
            to=user_id,
            document_url=absolute,
            file_name=file_name,
            caption="Aquí tienes la ficha técnica",
        )
        if message:
            _mark_technical_sheet_delivered(state, vehicle_id)
            _debug(
                "technical_sheet_sent",
                vehicle_id=vehicle_id,
                platform=platform,
                file_name=file_name,
                delivery="whatsapp_document",
            )
        return message
    _mark_technical_sheet_delivered(state, vehicle_id)
    _debug(
        "technical_sheet_sent",
        vehicle_id=vehicle_id,
        platform=platform,
        file_name=file_name,
        delivery="web_link",
        document_url=absolute,
    )
    return f"Aquí tienes la ficha técnica:\n{absolute}"


def _respond_selected_vehicle_inventory_qa(state: clientState, user_text: str) -> clientState:
    """Responde preguntas sobre el vehiculo seleccionado (ficha BD) sin salir de confirmacion de compra."""

    vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
    selected_label = str(state.get("selected_car", "")).strip()
    if not vehicle_id:
        _debug("inventory_qa_missing_selected_id")
        question = _build_purchase_question(state)
        return append_assistant_message(state, question)

    detail = fetch_vehicle_by_id(vehicle_id)
    if not isinstance(detail, dict):
        _debug("inventory_qa_fetch_detail_failed", vehicle_id=vehicle_id)
        msg = generate_verified_user_message(
            mode="operational",
            verified_facts_block="operacion: fetch_vehicle_by_id_qa\nexito: false\n",
            user_message=user_text,
            fallback="No pude consultar la ficha en este momento. Intenta de nuevo en unos segundos.",
            temperature=0.35,
        )
        question = _build_purchase_question(state)
        return _append_assistant_blocks(state, [msg, question])

    platform = str(state.get("platform", "web")).strip().lower() or "web"
    grounded = format_vehicle_detail(
        detail,
        platform=platform,
        include_color=user_asks_for_color(user_text),
        include_dimensions=user_asks_for_dimensions(user_text),
    )
    name = selected_label or format_vehicle_name(detail)
    body = generate_selected_vehicle_qa_response(name, grounded, user_text)
    question = _build_purchase_question(state)
    state["awaiting_purchase_confirmation"] = True
    _debug("answered_inventory_qa_while_awaiting_confirmation", vehicle_id=vehicle_id)
    blocks = [body]
    _append_technical_sheet_if_needed(state, blocks, user_text=user_text, detail=detail)
    blocks.append(question)
    return _append_assistant_blocks(state, blocks)


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
        _debug("model_resolution_single_match", selected=format_vehicle_name(selected))
        return selected

    _debug("model_resolution_ambiguous_matches", count=len(prioritized))
    return None


def _respond_with_vehicle_detail(state: clientState, vehicle_summary: dict[str, Any]) -> clientState:
    """Selecciona vehiculo y pide preferencias (transmision + pago) con mensaje fijo."""
    vehicle_id = str(vehicle_summary.get("id", "")).strip()
    previous_vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
    has_selected_financing_plan = bool(str(state.get("selected_financing_plan_id", "")).strip())
    has_selected_promotion = bool(str(state.get("selected_promotion_id", "")).strip())
    financing_removed_notice = ""
    promotion_removed_notice = ""
    if has_selected_financing_plan and previous_vehicle_id and previous_vehicle_id != vehicle_id:
        previous_plan_name = str(state.get("selected_financing_plan_name", "")).strip() or "el plan seleccionado"
        state["selected_financing_plan_id"] = ""
        state["selected_financing_plan_name"] = ""
        state["selected_financing_plan_lender"] = ""
        state["financing_plan_candidates"] = []
        state["financing_vehicle_candidates"] = []
        state["awaiting_financing_plan_selection"] = False
        state["awaiting_financing_vehicle_selection"] = False
        financing_removed_notice = generate_verified_user_message(
            mode="operational",
            verified_facts_block=(
                "evento: plan_financiamiento_removido_por_cambio_de_vehiculo\n"
                f"plan_anterior: {previous_plan_name}\n"
                f"vehicle_id_anterior: {previous_vehicle_id}\n"
                f"vehicle_id_nuevo: {vehicle_id}\n"
            ),
            user_message=latest_user_message(state),
            fallback=(
                f"Cambiamos de vehiculo, por lo que quite {previous_plan_name}. "
                "Si quieres, te ayudo a revisar financiamiento para este nuevo carro."
            ),
            temperature=0.35,
        )
    if has_selected_promotion:
        promotion_vehicle_ids = state.get("selected_promotion_vehicle_ids", [])
        normalized_ids = (
            {str(item).strip() for item in promotion_vehicle_ids if str(item).strip()}
            if isinstance(promotion_vehicle_ids, list)
            else set()
        )
        if normalized_ids and vehicle_id not in normalized_ids:
            previous_promotion = str(state.get("selected_promotion_title", "")).strip() or "la promocion seleccionada"
            state["selected_promotion_id"] = ""
            state["selected_promotion_title"] = ""
            state["selected_promotion_description"] = ""
            state["selected_promotion_valid_until"] = ""
            state["selected_promotion_vehicle_ids"] = []
            state["promotion_candidates"] = []
            state["promotion_vehicle_candidates"] = []
            state["awaiting_promotion_selection"] = False
            state["awaiting_promotion_vehicle_selection"] = False
            state["awaiting_promotion_vehicle_interest_confirmation"] = False
            state["awaiting_promotion_apply_confirmation"] = False
            promotion_removed_notice = generate_verified_user_message(
                mode="operational",
                verified_facts_block=(
                    "evento: promocion_removida_por_vehiculo_no_aplicable\n"
                    f"promocion_anterior: {previous_promotion}\n"
                    f"vehicle_id_nuevo: {vehicle_id}\n"
                ),
                user_message=latest_user_message(state),
                fallback=(
                    f"Este vehiculo no aplica para {previous_promotion}, por eso quite esa promocion. "
                    "Si quieres, puedo mostrarte otras promociones disponibles."
                ),
                temperature=0.35,
            )

    _debug("vehicle_detail_requested", vehicle_id=vehicle_id, summary=format_vehicle_name(vehicle_summary))
    if not vehicle_id:
        _debug("vehicle_detail_missing_id")
        message = generate_verified_user_message(
            mode="operational",
            verified_facts_block="error: vehicle_id_vacio_en_resumen\n",
            user_message=latest_user_message(state),
            fallback="No pude identificar ese vehiculo. Te muestro disponibles.",
            temperature=0.35,
        )
        state["awaiting_purchase_confirmation"] = False
        _clear_purchase_preferences(state)
        state["last_vehicle_candidates"] = []
        return append_assistant_message(state, message)
    detail = fetch_vehicle_by_id(vehicle_id)
    if not detail:
        _debug("vehicle_detail_not_found", vehicle_id=vehicle_id)
        message = generate_verified_user_message(
            mode="operational",
            verified_facts_block=(
                "operacion: fetch_vehicle_by_id\n"
                f"vehicle_id_solicitado: {vehicle_id}\n"
                "resultado: sin_detalle\n"
            ),
            user_message=latest_user_message(state),
            fallback="No pude obtener el detalle de ese carro en este momento. Te muestro otras opciones disponibles.",
            temperature=0.35,
        )
        state["awaiting_purchase_confirmation"] = False
        _clear_purchase_preferences(state)
        state["last_vehicle_candidates"] = []
        return append_assistant_message(state, message)

    state["selected_vehicle_id"] = vehicle_id
    state["selected_car"] = format_vehicle_name(detail)
    state["last_vehicle_candidates"] = []
    state["awaiting_purchase_confirmation"] = False
    state["awaiting_purchase_preferences"] = True
    state["selected_transmission"] = ""
    state["selected_payment_type"] = ""
    _reset_vehicle_images_state(state)
    _reset_technical_sheet_delivery(state)
    _debug(
        "vehicle_selected",
        selected_vehicle_id=state["selected_vehicle_id"],
        selected_car=state["selected_car"],
        next_step="awaiting_purchase_preferences",
    )

    blocks: list[str] = []
    if financing_removed_notice:
        blocks.append(financing_removed_notice)
    if promotion_removed_notice:
        blocks.append(promotion_removed_notice)
    blocks.append(_build_purchase_preferences_message(state["selected_car"]))
    return _append_assistant_blocks(state, blocks)


def _respond_with_selected_vehicle_detail_and_purchase_question(state: clientState) -> clientState:
    """Envia ficha/narrativa del vehiculo seleccionado y pregunta de prueba de manejo."""

    vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
    if not vehicle_id:
        _debug("selected_vehicle_detail_missing_id")
        state["awaiting_purchase_confirmation"] = False
        _clear_purchase_preferences(state)
        return append_assistant_message(
            state,
            "No pude identificar ese vehiculo. Te muestro disponibles.",
        )
    detail = fetch_vehicle_by_id(vehicle_id)
    if not detail:
        _debug("selected_vehicle_detail_not_found", vehicle_id=vehicle_id)
        state["awaiting_purchase_confirmation"] = False
        _clear_purchase_preferences(state)
        return append_assistant_message(
            state,
            "No pude obtener el detalle de ese carro en este momento. Te muestro otras opciones disponibles.",
        )

    if not str(state.get("selected_car", "")).strip():
        state["selected_car"] = format_vehicle_name(detail)

    platform = str(state.get("platform", "web")).strip().lower() or "web"
    user_text = latest_user_message(state)
    grounded_vehicle_facts = format_vehicle_detail(
        detail,
        platform=platform,
        include_color=user_asks_for_color(user_text),
        include_dimensions=user_asks_for_dimensions(user_text),
    )
    detail_narrative = generate_vehicle_detail_conversation(state["selected_car"], grounded_vehicle_facts)
    purchase_question = _build_purchase_question(state)
    blocks: list[str] = [detail_narrative, purchase_question]

    state["awaiting_purchase_preferences"] = False
    state["awaiting_purchase_confirmation"] = True
    previous_bot_message = str(state.get("last_bot_message", "")).strip()
    selected_car_name = str(state.get("selected_car", "")).strip()
    image_flags = _llm_vehicle_image_flags(
        user_text=user_text,
        previous_bot_message=previous_bot_message,
        selected_car_name=selected_car_name,
    )
    if image_flags.get("ask_images"):
        _debug("vehicle_detail_same_turn_first_images", vehicle_id=vehicle_id)
        _append_assistant_blocks(state, blocks)
        return _respond_with_first_images(state)
    if image_flags.get("ask_more_images"):
        _debug("vehicle_detail_same_turn_more_images", vehicle_id=vehicle_id)
        _append_assistant_blocks(state, blocks)
        if state.get("vehicle_images_last_batch"):
            return _respond_with_more_images(state)
        return _respond_with_first_images(state)
    return _append_assistant_blocks(state, blocks)


def _handle_awaiting_purchase_preferences(state: clientState, user_text: str) -> clientState:
    """Procesa respuestas de transmision/pago tras seleccionar vehiculo."""

    previous_bot_message = str(state.get("last_bot_message", "")).strip()
    existing_transmission = _normalize_preference_value(
        str(state.get("selected_transmission", "")),
        kind="transmission",
    )
    existing_payment = _normalize_preference_value(
        str(state.get("selected_payment_type", "")),
        kind="payment",
    )
    transmission, payment = _resolve_purchase_preferences(user_text, previous_bot_message)
    if not transmission and existing_transmission:
        transmission = existing_transmission
    if not payment and existing_payment:
        payment = existing_payment

    state["selected_transmission"] = transmission
    state["selected_payment_type"] = payment
    _debug(
        "purchase_preferences_resolved",
        transmission=transmission or None,
        payment_type=payment or None,
    )

    need_transmission = not transmission
    need_payment = not payment
    if need_transmission or need_payment:
        state["awaiting_purchase_preferences"] = True
        return append_assistant_message(
            state,
            _build_purchase_preferences_reask_message(
                need_transmission=need_transmission,
                need_payment=need_payment,
            ),
        )

    state["awaiting_purchase_preferences"] = False
    return _respond_with_selected_vehicle_detail_and_purchase_question(state)


def _top_vehicle_candidates(
    candidates: list[dict[str, Any]],
    *,
    limit: int = 16,
    available_only: bool = False,
) -> list[dict[str, Any]]:
    """Devuelve candidatos ordenados por prioridad de envío (máx. `limit`)."""

    valid = [item for item in candidates if isinstance(item, dict)]
    if available_only:
        valid = [
            item
            for item in valid
            if str(item.get("status", "")).strip().lower() == "available"
        ]
    return sort_vehicles_by_outbound_priority(valid)[:limit]


def _respond_available_list(
    state: clientState,
    vehicles: list[dict[str, Any]],
    *,
    unavailable_request: bool = False,
    failed_requirement_criterion: str = "",
) -> clientState:
    """Muestra inventario disponible y limpia contexto de selección previa."""
    state["awaiting_purchase_confirmation"] = False
    _clear_purchase_preferences(state)
    sorted_vehicles = sort_vehicles_by_outbound_priority(vehicles)
    state["last_vehicle_candidates"] = _top_vehicle_candidates(sorted_vehicles, available_only=True)
    state["selected_vehicle_id"] = ""
    state["selected_car"] = ""
    state["vehicle_comparison_ctx"] = {}
    _reset_vehicle_images_state(state)
    _reset_technical_sheet_delivery(state)
    available_count = sum(1 for item in vehicles if str(item.get("status", "")).strip().lower() == "available")
    _debug(
        "showing_available_list",
        total_vehicles=len(vehicles),
        available_vehicles=available_count,
        pending_candidates=len(state["last_vehicle_candidates"]),
        failed_requirement_criterion=failed_requirement_criterion or None,
    )
    available_list = format_available_vehicles_grouped(sorted_vehicles)
    user_q = latest_user_message(state)
    criterion = str(failed_requirement_criterion or "").strip().lower()
    # Catalogo general: intro fija (sin prosa LLM ni oferta de comparar).
    if not unavailable_request and not criterion:
        message = (
            "Para mandarte la ficha correcta, dime qué modelo te interesa:\n\n"
            f"{available_list}"
        )
        return append_assistant_message(state, message)

    verified_lines = [
        f"consulta_usuario: {user_q}",
        f"consulta_especifica_sin_stock_conocido: {str(unavailable_request or bool(criterion)).lower()}",
        f"vehiculos_disponibles_contados: {available_count}",
    ]
    if criterion:
        verified_lines.append(f"criterio_sin_coincidencias: {criterion}")
    verified_lines.extend(
        [
            "",
            "LISTADO_INVENTARIO_AGRUPADO:",
            available_list,
            "",
            "intro_sugerido_literal: Para mandarte la ficha correcta, dime qué modelo te interesa:",
        ]
    )
    verified = "\n".join(verified_lines)
    message = generate_verified_user_message(
        mode="catalog_availability",
        verified_facts_block=verified,
        user_message=user_q,
        fallback=(
            "Para mandarte la ficha correcta, dime qué modelo te interesa:\n\n"
            f"{available_list}"
        ),
        temperature=0.42,
    )
    return append_assistant_message(state, message)


def _respond_with_requirement_matches(
    state: clientState,
    matched: list[dict[str, Any]],
    user_text: str,
    *,
    criterion_summary: str,
    all_vehicles: list[dict[str, Any]],
    source: str,
) -> clientState:
    """Responde matches de filtro semántico (description/metadata): 0/1/N resultados."""

    criterion = str(criterion_summary or "").strip() or "el criterio solicitado"
    filtered = sort_vehicles_by_outbound_priority(
        [
            item
            for item in matched
            if isinstance(item, dict) and str(item.get("status", "")).strip().lower() == "available"
        ]
        or [item for item in matched if isinstance(item, dict)]
    )
    _debug(
        f"{source}_requirement_matches",
        count=len(filtered),
        criterion=criterion,
    )
    if not filtered:
        return _respond_available_list(
            state,
            all_vehicles,
            unavailable_request=True,
            failed_requirement_criterion=criterion,
        )
    if len(filtered) == 1:
        _debug(f"{source}_requirement_single_match", match=format_vehicle_name(filtered[0]))
        return _respond_with_vehicle_detail(state, filtered[0])

    platform = str(state.get("platform", "web")).strip().lower() or "web"
    listing = format_filtered_vehicles(filtered, platform=platform)
    verified = "\n".join(
        [
            f"criterio_busqueda: {criterion}",
            f"vehiculos_encontrados: {len(filtered)}",
            "",
            "LISTADO_RESULTADO_BUSQUEDA:",
            listing,
            "",
            "instruccion_cierre_literal: Si te interesa uno de estos, dime por favor el nombre exacto del vehiculo.",
        ]
    )
    message = generate_verified_user_message(
        mode="filtered_vehicles_followup",
        verified_facts_block=verified,
        user_message=user_text,
        fallback=f"{listing}\n\nSi te interesa uno de estos, dime por favor el nombre exacto del vehiculo.",
        temperature=0.42,
    )
    state["awaiting_purchase_confirmation"] = False
    _clear_purchase_preferences(state)
    state["selected_vehicle_id"] = ""
    state["selected_car"] = ""
    state["vehicle_comparison_ctx"] = {}
    _reset_vehicle_images_state(state)
    _reset_technical_sheet_delivery(state)
    state["last_vehicle_candidates"] = _top_vehicle_candidates(filtered)
    _debug(f"{source}_requirement_pending_candidates_saved", count=len(state["last_vehicle_candidates"]))
    return append_assistant_message(state, message)


def _refine_requirement_matches_with_pending(
    state: clientState,
    matched: list[dict[str, Any]],
    *,
    source: str,
) -> list[dict[str, Any]]:
    """Si hay candidatos pendientes, prioriza los matches que ya estaban en esa lista.

    El usuario suele estar refinando la lista mostrada (ej. 'que sea automatico'); solo
    si ningun match pertenece a los pendientes se conserva el resultado del catalogo completo.
    """

    pending = state.get("last_vehicle_candidates") or []
    if not isinstance(pending, list) or not pending or not matched:
        return matched
    pending_ids = {
        str(item.get("id", "")).strip()
        for item in pending
        if isinstance(item, dict) and str(item.get("id", "")).strip()
    }
    if not pending_ids:
        return matched
    refined = [
        item
        for item in matched
        if isinstance(item, dict) and str(item.get("id", "")).strip() in pending_ids
    ]
    if refined:
        _debug(
            f"{source}_requirement_refined_from_pending",
            pending=len(pending_ids),
            matched=len(matched),
            refined=len(refined),
        )
        return refined
    return matched


def _vehicles_for_price_ranking(
    state: clientState,
    vehicles: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Prioriza candidatos pendientes; si no hay, usa inventario available."""

    pending = state.get("last_vehicle_candidates") or []
    if isinstance(pending, list):
        from_pending = [item for item in pending if isinstance(item, dict)]
        if from_pending:
            return from_pending
    available = [
        item
        for item in vehicles
        if isinstance(item, dict) and str(item.get("status", "")).strip().lower() == "available"
    ]
    if available:
        return available
    return [item for item in vehicles if isinstance(item, dict)]


def _pick_lowest_price_vehicles(vehicles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Devuelve el/los vehiculos con el precio numerico mas bajo."""

    priced: list[tuple[int, dict[str, Any]]] = []
    for item in vehicles:
        if not isinstance(item, dict):
            continue
        price = _coerce_price(item.get("price"))
        if price is None:
            continue
        priced.append((price, item))
    if not priced:
        return []
    min_price = min(price for price, _ in priced)
    return [item for price, item in priced if price == min_price]


def _try_respond_cheapest_price_request(
    state: clientState,
    vehicles: list[dict[str, Any]],
    user_text: str,
    *,
    source: str,
) -> clientState | None:
    """Si el mensaje pide el mas barato/economico, responde con min(price); si no, None."""

    if not is_cheapest_price_request(user_text, _CHEAPEST_PRICE_SIGNALS_NORMALIZED):
        return None
    # Rangos numericos ("hasta 200 mil") siguen por detect_vehicle_filters.
    price_filters = _extract_price_filters(user_text)
    if price_filters:
        _debug(f"{source}_cheapest_skipped_numeric_price_filter", filters=price_filters)
        return None

    pool = _vehicles_for_price_ranking(state, vehicles)
    cheapest = _pick_lowest_price_vehicles(pool)
    _debug(
        f"{source}_cheapest_price_request",
        pool=len(pool),
        matches=len(cheapest),
        match_ids=[str(item.get("id", "")).strip() for item in cheapest],
    )
    if not cheapest:
        return None
    if len(cheapest) == 1:
        return _respond_with_vehicle_detail(state, cheapest[0])
    return _respond_with_requirement_matches(
        state,
        cheapest,
        user_text,
        criterion_summary="menor precio",
        all_vehicles=vehicles,
        source=f"{source}_cheapest",
    )


def _try_respond_requirement_search(
    state: clientState,
    vehicles: list[dict[str, Any]],
    user_text: str,
    *,
    source: str,
) -> clientState | None:
    """Si el mensaje es un filtro por description/metadata, responde con matches; si no, None."""

    result = classify_vehicle_requirement_matches(user_text, vehicles)
    if not result.get("is_requirement_search"):
        _debug(f"{source}_requirement_search_skipped")
        return None
    matched = result.get("matched_vehicles") or []
    if not isinstance(matched, list):
        matched = []
    matched = _refine_requirement_matches_with_pending(state, matched, source=source)
    return _respond_with_requirement_matches(
        state,
        matched,
        user_text,
        criterion_summary=str(result.get("criterion_summary") or ""),
        all_vehicles=vehicles,
        source=source,
    )


def _respond_other_vehicles_with_optional_filters(
    state: clientState,
    vehicles: list[dict[str, Any]],
    user_text: str,
) -> clientState:
    """Resuelve `ver otros`: aplica filtros del turno o vuelve a listado general."""

    filters = detect_vehicle_filters(user_text, vehicles)
    _debug("other_vehicles_filters_detected", filters=filters)
    if filters:
        return _respond_with_filtered_search(state, filters, user_text, source="other_vehicles")
    cheapest_state = _try_respond_cheapest_price_request(
        state, vehicles, user_text, source="other_vehicles"
    )
    if cheapest_state is not None:
        return cheapest_state
    requirement_state = _try_respond_requirement_search(
        state, vehicles, user_text, source="other_vehicles"
    )
    if requirement_state is not None:
        return requirement_state
    return _respond_available_list(state, vehicles)


def _price_hint_from_filters(filters: dict[str, Any]) -> str:
    """Construye texto corto del rango de precio para mensajes sin resultados."""

    min_price = filters.get("minPrice")
    max_price = filters.get("maxPrice")
    if min_price is not None and max_price is not None:
        return f" en el rango de ${min_price} a ${max_price}"
    if min_price is not None:
        return f" con precio desde ${min_price}"
    if max_price is not None:
        return f" con precio hasta ${max_price}"
    return ""


def _respond_with_filtered_search(
    state: clientState,
    filters: dict[str, Any],
    user_text: str,
    *,
    source: str,
) -> clientState:
    """Ejecuta búsqueda filtrada y responde casos: 0/1/múltiples resultados."""

    try:
        filtered = sort_vehicles_by_outbound_priority(search_vehicles(filters))
        _debug(f"{source}_search_results", count=len(filtered), filters=filters)
    except Exception:
        _debug(f"{source}_search_error", filters=filters)
        filtered = []

    if not filtered:
        _debug(f"{source}_search_empty", filters=filters)
        price_hint = _price_hint_from_filters(filters)
        message = generate_verified_user_message(
            mode="inventory_search_empty",
            verified_facts_block=(
                f"criterios_busqueda_json: {json.dumps(filters, default=str, ensure_ascii=False)}\n"
                "vehiculos_encontrados: 0\n"
            ),
            user_message=user_text,
            fallback=f"No encontre carros con esas caracteristicas{price_hint}. Quieres que te muestre todos los disponibles?",
            temperature=0.35,
        )
        return append_assistant_message(state, message)
    if len(filtered) == 1:
        _debug(f"{source}_search_single_match", match=format_vehicle_name(filtered[0]))
        return _respond_with_vehicle_detail(state, filtered[0])
    if looks_like_feature_request(user_text, _FEATURE_SIGNALS_NORMALIZED):
        _debug(f"{source}_search_multiple_feature_request", count=len(filtered))
        platform = str(state.get("platform", "web")).strip().lower() or "web"
        listing = format_filtered_vehicles(filtered, platform=platform)
        verified = "\n".join(
            [
                "LISTADO_RESULTADO_BUSQUEDA:",
                listing,
                "",
                "instruccion_cierre_literal: Si te interesa uno de estos, dime por favor el nombre exacto del vehiculo.",
            ]
        )
        message = generate_verified_user_message(
            mode="filtered_vehicles_followup",
            verified_facts_block=verified,
            user_message=user_text,
            fallback=f"{listing}\n\nSi te interesa uno de estos, dime por favor el nombre exacto del vehiculo.",
            temperature=0.42,
        )
    else:
        _debug(f"{source}_search_multiple_specific_request", count=len(filtered))
        options = format_candidate_options(filtered)
        if options:
            message = generate_vehicle_candidates_selection_message(options, user_message=user_text)
        else:
            message = generate_verified_user_message(
                mode="operational",
                verified_facts_block="situacion: multiples_matches_sin_lista_formateada\n",
                user_message=user_text,
                fallback=(
                    "Encontre varios carros similares. "
                    "¿Cual te interesa? Puedes responder con el nombre o el numero."
                ),
                temperature=0.35,
            )
    state["last_vehicle_candidates"] = _top_vehicle_candidates(filtered)
    _debug(f"{source}_pending_candidates_saved", count=len(state["last_vehicle_candidates"]))
    return append_assistant_message(state, message)


def _vehicle_comparison_llm_gate(user_text: str) -> bool:
    """Prefiltro barato antes de invocar el extractor LLM de comparacion."""

    normalized = normalize_user_text(user_text)
    if not normalized or len(normalized) < 6:
        return False
    hints = (
        "compar",
        "compara",
        "vs",
        "versus",
        "diferencia",
        "diferencias",
        "conviene",
        "cual conviene",
        "cuál conviene",
        "entre ",
        " contra ",
        " o ",
    )
    return any(signal in normalized for signal in hints)


def _should_invoke_vehicle_comparison_llm(state: clientState, user_text: str) -> bool:
    """Decide si conviene llamar extractor LLM de comparación."""

    if _vehicle_comparison_llm_gate(user_text):
        return True
    pending = state.get("last_vehicle_candidates") or []
    if isinstance(pending, list) and len(pending) >= 2 and normalize_user_text(user_text):
        if re.search(r"\b\d{1,2}\b.*\b\d{1,2}\b", normalize_user_text(user_text)):
            return True
    return False


def _prioritized_vehicle_matches(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Prioriza unidades disponibles; si no hay, conserva coincidencias válidas."""

    available = [
        item
        for item in candidates
        if isinstance(item, dict) and str(item.get("status", "")).strip().lower() == "available"
    ]
    return sort_vehicles_by_outbound_priority(available or [item for item in candidates if isinstance(item, dict)])


def _matches_for_vehicle_query(query: str, vehicles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Busca coincidencias para una consulta libre usando filtros detectados."""

    q = str(query or "").strip()
    if not q:
        return []
    filters = detect_vehicle_filters(q, vehicles)
    if not filters:
        return []
    try:
        found = search_vehicles(filters)
    except Exception:
        return []
    return [item for item in found if isinstance(item, dict)]


def _clear_vehicle_comparison_ctx(state: clientState) -> None:
    """Limpia estado temporal de comparación multi-turno."""

    state["vehicle_comparison_ctx"] = {}


def _respond_with_vehicle_comparison(
    state: clientState,
    detail_a: dict[str, Any],
    detail_b: dict[str, Any],
) -> clientState:
    """Muestra comparacion sin cambiar selected_vehicle_id."""

    _clear_vehicle_comparison_ctx(state)
    platform = str(state.get("platform", "web")).strip().lower() or "web"
    name_a = format_vehicle_name(detail_a)
    name_b = format_vehicle_name(detail_b)
    user_q = latest_user_message(state)
    grounded = format_two_vehicle_comparison_grounding(
        detail_a,
        detail_b,
        platform=platform,
        include_color=user_asks_for_color(user_q),
        include_dimensions=user_asks_for_dimensions(user_q),
    )
    narrative = generate_vehicle_comparison_conversation(
        name_a,
        name_b,
        grounded,
        user_message=user_q,
    )
    closer = "Dime con cual quieres continuar y te muestro ese modelo en detalle."
    message = f"{narrative.rstrip()}\n\n{closer}"
    return append_assistant_message(state, message)


def _comparison_prompt_first_ambiguous(
    state: clientState,
    matches: list[dict[str, Any]],
    other_query: str,
) -> clientState:
    """Pide aclarar el primer vehículo cuando hay múltiples coincidencias."""

    state["last_vehicle_candidates"] = _top_vehicle_candidates(matches)
    state["vehicle_comparison_ctx"] = {"other_query": str(other_query or "").strip()}
    options = format_candidate_options(matches)
    body = (
        "Encontre varias opciones para el primer vehiculo de la comparacion. "
        "Elige cual es la primera unidad (nombre o numero).\n\n"
        f"{options}"
    )
    return append_assistant_message(state, body)


def _comparison_prompt_second_ambiguous(
    state: clientState,
    peer_id: str,
    matches: list[dict[str, Any]],
) -> clientState:
    """Pide aclarar el segundo vehículo cuando hay múltiples coincidencias."""

    state["last_vehicle_candidates"] = _top_vehicle_candidates(matches)
    state["vehicle_comparison_ctx"] = {"peer_resolved_id": str(peer_id).strip()}
    options = format_candidate_options(matches)
    body = (
        "Encontre varias opciones para el segundo vehiculo. "
        "Elige cual comparar (nombre o numero).\n\n"
        f"{options}"
    )
    return append_assistant_message(state, body)


def _comparison_after_first_vehicle_chosen(
    state: clientState,
    vehicles: list[dict[str, Any]],
    first_summary: dict[str, Any],
    other_query: str,
) -> clientState:
    """Continúa comparación tras resolver el primer vehículo."""

    id_a = str(first_summary.get("id", "")).strip()
    oq = str(other_query or "").strip()
    if not id_a or not oq:
        _clear_vehicle_comparison_ctx(state)
        return append_assistant_message(state, "No pude armar la comparacion. Intenta de nuevo con los dos modelos.")
    detail_a = fetch_vehicle_by_id(id_a)
    if not isinstance(detail_a, dict):
        _clear_vehicle_comparison_ctx(state)
        return append_assistant_message(state, "No pude cargar la ficha del primer vehiculo. Intenta otra vez.")

    right_matches = _prioritized_vehicle_matches(_matches_for_vehicle_query(oq, vehicles))
    if not right_matches:
        _clear_vehicle_comparison_ctx(state)
        return append_assistant_message(
            state,
            generate_verified_user_message(
                mode="operational",
                verified_facts_block=(
                    f"operacion: comparacion_segundo_vehiculo\n"
                    f"primer_vehiculo: {format_vehicle_name(detail_a)}\n"
                    f"consulta_segundo: {oq}\n"
                    "resultado: sin_coincidencias\n"
                ),
                user_message=latest_user_message(state),
                fallback=(
                    f"No encontre en inventario un segundo vehiculo que coincida con \"{oq}\" "
                    f"para compararlo con {format_vehicle_name(detail_a)}. "
                    "Prueba con otra marca, modelo o año."
                ),
                temperature=0.35,
            ),
        )
    if len(right_matches) == 1:
        detail_b = fetch_vehicle_by_id(str(right_matches[0].get("id", "")).strip())
        if not isinstance(detail_b, dict):
            _clear_vehicle_comparison_ctx(state)
            return append_assistant_message(state, "No pude cargar la ficha del segundo vehiculo.")
        id_b = str(detail_b.get("id", "")).strip()
        if id_a == id_b:
            _clear_vehicle_comparison_ctx(state)
            return append_assistant_message(
                state,
                "Es el mismo vehiculo; necesito dos unidades distintas para comparar. "
                "Dime otro modelo o año.",
            )
        return _respond_with_vehicle_comparison(state, detail_a, detail_b)
    return _comparison_prompt_second_ambiguous(state, id_a, right_matches)


def _comparison_after_second_vehicle_chosen(
    state: clientState,
    peer_id: str,
    second_summary: dict[str, Any],
) -> clientState:
    """Resuelve comparación cuando el segundo vehículo ya fue elegido."""

    id_a = str(peer_id or "").strip()
    id_b = str(second_summary.get("id", "")).strip()
    _clear_vehicle_comparison_ctx(state)
    state["last_vehicle_candidates"] = []
    if not id_a or not id_b:
        return append_assistant_message(state, "No pude completar la comparacion. Elige dos vehiculos distintos.")
    if id_a == id_b:
        return append_assistant_message(
            state,
            "Es el mismo vehiculo; dime otro para comparar.",
        )
    detail_a = fetch_vehicle_by_id(id_a)
    detail_b = fetch_vehicle_by_id(id_b)
    if not isinstance(detail_a, dict) or not isinstance(detail_b, dict):
        return append_assistant_message(state, "No pude cargar las fichas para comparar. Intenta de nuevo.")
    return _respond_with_vehicle_comparison(state, detail_a, detail_b)


def _run_vehicle_comparison_from_payload(
    state: clientState,
    vehicles: list[dict[str, Any]],
    payload: dict[str, Any],
    *,
    selected_vehicle_id: str,
) -> clientState | None:
    """Ejecuta comparacion a partir del JSON del LLM; None si no aplica."""

    if not _coerce_to_bool(payload.get("wants_compare")):
        return None

    pending = state.get("last_vehicle_candidates") or []
    if not isinstance(pending, list):
        pending = []

    if _coerce_to_bool(payload.get("use_candidate_indices")) and len(pending) >= 2:
        il = payload.get("index_left")
        ir = payload.get("index_right")
        if isinstance(il, int) and isinstance(ir, int):
            i = il - 1
            j = ir - 1
            if 0 <= i < len(pending) and 0 <= j < len(pending) and isinstance(pending[i], dict) and isinstance(pending[j], dict):
                id_a = str(pending[i].get("id", "")).strip()
                id_b = str(pending[j].get("id", "")).strip()
                if id_a and id_b and id_a != id_b:
                    detail_a = fetch_vehicle_by_id(id_a)
                    detail_b = fetch_vehicle_by_id(id_b)
                    if isinstance(detail_a, dict) and isinstance(detail_b, dict):
                        return _respond_with_vehicle_comparison(state, detail_a, detail_b)
                if id_a == id_b:
                    return append_assistant_message(
                        state,
                        "Son la misma opcion de la lista; elige dos numeros distintos para comparar.",
                    )
        return append_assistant_message(
            state,
            "Indica dos numeros validos de la lista para comparar, por ejemplo \"1 y 3\".",
        )

    if _coerce_to_bool(payload.get("use_selected_as_left")):
        sid = str(selected_vehicle_id or "").strip()
        if not sid:
            return append_assistant_message(
                state,
                "Para comparar con el vehiculo que estabas viendo, primero vuelve a abrir su detalle.",
            )
        q_right = str(payload.get("query_right") or "").strip()
        if not q_right:
            return append_assistant_message(
                state,
                "Dime cual otro vehiculo quieres comparar (marca, modelo o año).",
            )
        detail_a = fetch_vehicle_by_id(sid)
        if not isinstance(detail_a, dict):
            return append_assistant_message(state, "No pude cargar el vehiculo actual para comparar.")
        first_summary = {"id": sid, **detail_a}
        return _comparison_after_first_vehicle_chosen(state, vehicles, first_summary, q_right)

    q_left = str(payload.get("query_left") or "").strip()
    q_right = str(payload.get("query_right") or "").strip()
    if not q_left or not q_right:
        return append_assistant_message(
            state,
            "Para comparar necesito dos vehiculos distintos. Ejemplo: \"compara el 1 y el 3\" o nombra dos unidades por marca, modelo y año.",
        )

    left_matches = _prioritized_vehicle_matches(_matches_for_vehicle_query(q_left, vehicles))
    if not left_matches:
        return append_assistant_message(
            state,
            f"No encontre el primer vehiculo ({q_left}) en inventario. Revisa marca, modelo o año.",
        )
    if len(left_matches) == 1:
        return _comparison_after_first_vehicle_chosen(state, vehicles, left_matches[0], q_right)
    return _comparison_prompt_first_ambiguous(state, left_matches, q_right)


def car_selection(state: clientState) -> clientState:
    """Unifica listado general, filtros por caracteristica y detalle por carro."""

    state["current_node"] = "car_selection"
    if state.get("suppress_commercial_node_once"):
        state["suppress_commercial_node_once"] = False
        _debug("suppress_commercial_node_once", action="skip_node_execution")
        return state
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
        awaiting_purchase_preferences=bool(state.get("awaiting_purchase_preferences")),
        awaiting_purchase_confirmation=bool(state.get("awaiting_purchase_confirmation")),
        has_pending_candidates=bool(state.get("last_vehicle_candidates")),
    )

    try:
        vehicles = fetch_vehicles()
        _debug("catalog_loaded", total_vehicles=len(vehicles))
    except Exception as exc:
        response = getattr(exc, "response", None)
        status_code = getattr(response, "status_code", None)
        response_text = ""
        if response is not None:
            response_text = str(getattr(response, "text", "") or "").strip()
        _log.warning(
            "[car_selection] catalog_fetch_error | status_code=%r error=%s response=%r",
            status_code,
            exc,
            response_text[:300],
        )
        _debug(
            "catalog_fetch_error",
            status_code=status_code,
            error=str(exc),
            response=response_text[:300],
        )
        message = generate_verified_user_message(
            mode="operational",
            verified_facts_block="operacion: fetch_vehicles_catalogo\nexito: false\n",
            user_message=user_text,
            fallback="No pude consultar el catalogo en este momento. Intenta nuevamente en unos segundos.",
            temperature=0.35,
        )
        return append_assistant_message(state, message)

    if state.get("show_selected_vehicle_detail_once"):
        state["show_selected_vehicle_detail_once"] = False
        selected_vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
        if selected_vehicle_id:
            prefs_done = bool(
                _normalize_preference_value(str(state.get("selected_transmission", "")), kind="transmission")
                and _normalize_preference_value(str(state.get("selected_payment_type", "")), kind="payment")
            )
            if prefs_done and not state.get("awaiting_purchase_preferences"):
                _debug(
                    "show_selected_vehicle_detail_once",
                    selected_vehicle_id=selected_vehicle_id,
                    selected_car=state.get("selected_car", ""),
                )
                return _respond_with_selected_vehicle_detail_and_purchase_question(state)
            selected_detail = fetch_vehicle_by_id(selected_vehicle_id)
            if isinstance(selected_detail, dict):
                _debug(
                    "show_selected_vehicle_preferences_once",
                    selected_vehicle_id=selected_vehicle_id,
                    selected_car=state.get("selected_car", ""),
                )
                return _respond_with_vehicle_detail(state, selected_detail)

    if state.get("awaiting_purchase_preferences"):
        previous_bot_message = str(state.get("last_bot_message", "")).strip()
        selected_car_name = str(state.get("selected_car", "")).strip()
        step_flags = classify_vehicle_step_flags(previous_bot_message, user_text, selected_car_name)
        image_flags = _effective_vehicle_image_flags(user_text, step_flags)
        step_flags = {**step_flags, **image_flags}
        _debug("purchase_preferences_vehicle_step_flags", **step_flags)
        # Escapes: no forzar transmision/pago si el usuario quiere salir al catalogo.
        if step_flags.get("wants_other_vehicles"):
            state["awaiting_purchase_confirmation"] = False
            return _respond_other_vehicles_with_optional_filters(state, vehicles, user_text)
        if step_flags.get("reject_purchase"):
            return _respond_available_list(state, vehicles)
        return _handle_awaiting_purchase_preferences(state, user_text)

    if state.get("awaiting_purchase_confirmation"):
        previous_bot_message = str(state.get("last_bot_message", "")).strip()
        selected_car_name = str(state.get("selected_car", "")).strip()
        cheapest_state = _try_respond_cheapest_price_request(
            state, vehicles, user_text, source="purchase_confirmation"
        )
        if cheapest_state is not None:
            return cheapest_state
        step_flags = classify_vehicle_step_flags(previous_bot_message, user_text, selected_car_name)
        image_flags = _effective_vehicle_image_flags(user_text, step_flags)
        step_flags = {**step_flags, **image_flags}
        _debug("vehicle_step_flags", **step_flags)
        if step_flags.get("wants_compare_two_vehicles"):
            numbered = format_candidate_options(state.get("last_vehicle_candidates") or [])
            payload = classify_vehicle_comparison_payload(
                previous_bot_message=previous_bot_message,
                user_message=user_text,
                selected_vehicle_name=selected_car_name,
                numbered_candidate_lines=numbered,
            )
            cmp_state = _run_vehicle_comparison_from_payload(
                state,
                vehicles,
                payload,
                selected_vehicle_id=str(state.get("selected_vehicle_id", "")).strip(),
            )
            if cmp_state is not None:
                return cmp_state
        if step_flags.get("ask_promotions"):
            state["awaiting_purchase_confirmation"] = False
            state["current_node"] = "promotions"
            state["intent"] = "promotions"
            _debug("route_change", next_node="promotions", reason="llm_flags")
            return state
        if step_flags.get("ask_images"):
            return _respond_with_first_images(state)
        if step_flags.get("ask_more_images"):
            return _respond_with_more_images(state)
        if is_selected_vehicle_specs_request(
            user_text,
            selected_vehicle_id=str(state.get("selected_vehicle_id", "")).strip(),
            vehicles=vehicles,
            pick_vehicle_from_filters_fn=_pick_vehicle_from_filters,
        ):
            return _respond_selected_vehicle_inventory_qa(state, user_text)
        if step_flags.get("wants_other_vehicles"):
            state["awaiting_purchase_confirmation"] = False
            return _respond_other_vehicles_with_optional_filters(state, vehicles, user_text)
        if step_flags.get("reject_purchase"):
            return _respond_available_list(state, vehicles)

        # Preferencia de contacto por heuristica (sin LLM) antes de otros clasificadores.
        contact_h = detect_contact_method(user_text)
        if contact_h and contact_h != "conflict":
            return _route_to_lead_capture(
                state,
                contact_method=contact_h,
                reason="contact_method_heuristic",
            )

        # Cita/prueba gana a financiamiento en este paso.
        if is_test_drive_or_visit_request(user_text, _TEST_DRIVE_VISIT_SIGNALS_NORMALIZED):
            return _route_to_lead_capture(
                state,
                contact_method="appointment",
                reason="test_drive_or_visit",
            )

        if step_flags.get("ask_financing") or is_financing_request(user_text, _FINANCING_SIGNALS_NORMALIZED):
            state["awaiting_purchase_confirmation"] = False
            state["current_node"] = "financing"
            _debug("route_change", next_node="financing", reason="financing_request")
            return state

        decision = classify_purchase_confirmation_intent(previous_bot_message, user_text)
        _debug(
            "purchase_confirmation_classified",
            decision=decision,
            selected_car=state.get("selected_car", ""),
        )
        if decision == "VER_MAS_IMAGENES" or step_flags.get("ask_more_images"):
            if state.get("vehicle_images_last_batch"):
                return _respond_with_more_images(state)
            return _respond_with_first_images(state)
        if step_flags.get("ask_images"):
            return _respond_with_first_images(state)
        if decision == "PREGUNTA_MODELO":
            other = _pick_vehicle_from_filters(user_text, vehicles)
            cur_id = str(state.get("selected_vehicle_id", "")).strip()
            other_id = str(other.get("id", "")).strip() if isinstance(other, dict) else ""
            if other_id and other_id != cur_id:
                return _respond_with_vehicle_detail(state, other)
            return _respond_selected_vehicle_inventory_qa(state, user_text)
        if decision == "VER_MODELO":
            selected_vehicle = _pick_vehicle_from_filters(user_text, vehicles)
            if selected_vehicle:
                return _respond_with_vehicle_detail(state, selected_vehicle)
            _debug("model_resolution_no_unique_match")
            return _respond_available_list(state, vehicles)
        if decision == "NO":
            return _respond_available_list(state, vehicles)

        # LLM de contacto solo si heuristica fallo/conflicto y no hubo otra salida.
        contact_method = _resolve_contact_method(user_text, previous_bot_message)
        if contact_method:
            return _route_to_lead_capture(
                state,
                contact_method=contact_method,
                reason="contact_method",
            )

        # SI / confirm_purchase / UNKNOWN sin canal claro: repregunta preferencia de contacto.
        _debug(
            "purchase_confirmation_unknown",
            user_text=user_text,
            confirm_purchase=bool(step_flags.get("confirm_purchase")),
            decision=decision,
        )
        question = _build_purchase_question(state)
        return append_assistant_message(state, question)

    if _should_invoke_vehicle_comparison_llm(state, user_text):
        numbered = format_candidate_options(state.get("last_vehicle_candidates") or [])
        payload = classify_vehicle_comparison_payload(
            previous_bot_message=str(state.get("last_bot_message", "")).strip(),
            user_message=user_text,
            selected_vehicle_name=str(state.get("selected_car", "")).strip(),
            numbered_candidate_lines=numbered,
        )
        cmp_state = _run_vehicle_comparison_from_payload(
            state,
            vehicles,
            payload,
            selected_vehicle_id=str(state.get("selected_vehicle_id", "")).strip(),
        )
        if cmp_state is not None:
            return cmp_state

    pending_result = _find_candidate_from_pending(state, user_text)
    if isinstance(pending_result, list):
        return _respond_pending_selection_clarification(state, pending_result)
    if isinstance(pending_result, dict):
        vctx = state.get("vehicle_comparison_ctx")
        if isinstance(vctx, dict) and vctx:
            other_q = str(vctx.get("other_query") or "").strip()
            peer = str(vctx.get("peer_resolved_id") or "").strip()
            if other_q and not peer:
                _debug("comparison_first_pick", other_query=other_q)
                return _comparison_after_first_vehicle_chosen(state, vehicles, pending_result, other_q)
            if peer:
                _debug("comparison_second_pick", peer_resolved_id=peer)
                return _comparison_after_second_vehicle_chosen(state, peer, pending_result)
        _debug("continuing_from_pending_candidates")
        return _respond_with_vehicle_detail(state, pending_result)

    if is_general_request(user_text, _GENERAL_SIGNALS_NORMALIZED):
        _debug("branch_general_request")
        return _respond_available_list(state, vehicles)

    if is_financing_request(user_text, _FINANCING_SIGNALS_NORMALIZED):
        state["current_node"] = "financing"
        _debug("route_change", next_node="financing", reason="mid_selection_financing")
        return state
    if is_promotions_request(user_text, _PROMOTIONS_SIGNALS_NORMALIZED):
        state["current_node"] = "promotions"
        state["intent"] = "promotions"
        _debug("route_change", next_node="promotions", reason="mid_selection_promotions")
        return state

    filters = detect_vehicle_filters(user_text, vehicles)
    _debug("filters_detected", filters=filters)
    if filters:
        return _respond_with_filtered_search(state, filters, user_text, source="search")

    cheapest_state = _try_respond_cheapest_price_request(state, vehicles, user_text, source="search")
    if cheapest_state is not None:
        return cheapest_state

    requirement_state = _try_respond_requirement_search(state, vehicles, user_text, source="search")
    if requirement_state is not None:
        return requirement_state

    unavailable_request = looks_like_specific_vehicle_request(
        user_text,
        is_general_request_fn=lambda text: is_general_request(text, _GENERAL_SIGNALS_NORMALIZED),
        looks_like_feature_request_fn=lambda text: looks_like_feature_request(text, _FEATURE_SIGNALS_NORMALIZED),
    )
    _debug(
        "no_filters_detected_fallback_to_available",
        unavailable_request=unavailable_request,
    )
    return _respond_available_list(state, vehicles, unavailable_request=unavailable_request)
