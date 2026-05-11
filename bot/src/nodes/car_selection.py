"""Nodo unificado para exploracion, busqueda y seleccion de vehiculos."""

from __future__ import annotations

import json
import re
from typing import Any

from src.state import clientState

from src.services.llm_responses import (
    _coerce_to_bool,
    classify_purchase_confirmation_intent,
    classify_vehicle_comparison_payload,
    classify_vehicle_step_flags,
    generate_selected_vehicle_qa_response,
    generate_vehicle_candidates_selection_message,
    generate_vehicle_detail_conversation,
    generate_vehicle_purchase_question,
    generate_verified_user_message,
)
from src.services.car_selection_fallback import (
    is_financing_request,
    is_general_request,
    is_more_images_request,
    is_promotions_request,
    is_selected_vehicle_specs_request,
    looks_like_feature_request,
    looks_like_specific_vehicle_request,
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
    format_candidate_options,
    format_filtered_vehicles,
    format_images_bulleted_list,
    format_vehicle_name,
    format_vehicle_comparison_table,
    format_vehicle_detail,
)
from src.utils.signals import (
    FEATURE_SIGNALS,
    FINANCING_SIGNALS,
    GENERAL_SIGNALS,
    MORE_IMAGES_SIGNALS,
    NO_IMAGES_AVAILABLE_MESSAGE,
    NO_MORE_IMAGES_MESSAGE,
    PROMOTIONS_SIGNALS,
)
from src.utils.whatsapp_markers import (
    build_whatsapp_image_marker_block as build_shared_whatsapp_image_marker_block,
    normalize_image_url_for_chat,
)
from src.utils.state_helpers import append_assistant_message, latest_user_message

def _normalize_signal_set(values: set[str]) -> set[str]:
    """Normaliza señales para compararlas con texto de usuario normalizado."""

    return {normalize_user_text(value) for value in values}


_GENERAL_SIGNALS_NORMALIZED = _normalize_signal_set(GENERAL_SIGNALS)
_FEATURE_SIGNALS_NORMALIZED = _normalize_signal_set(FEATURE_SIGNALS)
_MORE_IMAGES_SIGNALS_NORMALIZED = _normalize_signal_set(MORE_IMAGES_SIGNALS)
_FINANCING_SIGNALS_NORMALIZED = _normalize_signal_set(FINANCING_SIGNALS)
_PROMOTIONS_SIGNALS_NORMALIZED = _normalize_signal_set(PROMOTIONS_SIGNALS)


def _debug(event: str, **payload: Any) -> None:
    """Imprime trazas del flujo para depuracion en consola."""

    if payload:
        pairs = ", ".join(f"{key}={value!r}" for key, value in payload.items())
        print(f"[car_selection] {event} | {pairs}")
        return
    print(f"[car_selection] {event}")


def _find_candidate_from_pending(state: clientState, user_text: str) -> dict[str, Any] | None:
    """Resuelve selección del usuario contra candidatos pendientes (nombre o índice)."""
    pending = state.get("last_vehicle_candidates", [])
    if not isinstance(pending, list) or not pending:
        _debug("pending_candidates_empty")
        return None
    options = [format_vehicle_name(item) for item in pending if isinstance(item, dict)]
    _debug("pending_candidates_detected", options=options)
    picked_label = canonicalize_with_typo_support(user_text, options, threshold=0.72)
    if not picked_label:
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
            if 0 <= idx < len(pending) and isinstance(pending[idx], dict):
                _debug("pending_candidate_selected_by_index", index=idx, value=format_vehicle_name(pending[idx]))
                return pending[idx]
        _debug("pending_candidate_not_matched", user_text=user_text)
        return None
    for item in pending:
        if not isinstance(item, dict):
            continue
        if format_vehicle_name(item) == picked_label:
            _debug("pending_candidate_selected_by_name", selected=picked_label)
            return item
    _debug("pending_candidate_label_without_match", picked_label=picked_label)
    return None


def _format_images_block(images: list[str]) -> str:
    """Renderiza bloque de imágenes en texto para canales no-WhatsApp."""
    if not images:
        return generate_verified_user_message(
            mode="operational",
            verified_facts_block=(
                "tipo: bloque_imagenes_vacio\n"
                f"texto_literal_sistema: {NO_IMAGES_AVAILABLE_MESSAGE}\n"
            ),
            user_message="",
            fallback=NO_IMAGES_AVAILABLE_MESSAGE,
            temperature=0.35,
        )
    return format_images_bulleted_list(images, _image_url_for_chat)


def _build_whatsapp_image_marker_block(state: clientState, vehicle_id: str, images: list[str]) -> str:
    """Genera marcadores JSON para envío de imágenes por WhatsApp."""
    user_id = str(state.get("user_id", "")).strip()
    if not user_id or not vehicle_id or not images:
        return ""
    return build_shared_whatsapp_image_marker_block(
        to=user_id,
        vehicle_id=vehicle_id,
        image_urls=images,
    )


def _build_purchase_question(include_images_option: bool) -> str:
    """Genera pregunta de cierre comercial según contexto de imágenes."""
    return generate_vehicle_purchase_question(include_images_option=include_images_option)


def _build_no_more_images_message() -> str:
    """Genera mensaje cuando no hay mas imagenes por mostrar."""

    return generate_verified_user_message(
        mode="operational",
        verified_facts_block=f"tipo: sin_mas_imagenes\ntexto_literal_sistema: {NO_MORE_IMAGES_MESSAGE}\n",
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
    state["vehicle_images_cursor"] = 0
    state["vehicle_images_has_more"] = False
    state["vehicle_images_last_batch"] = []


def _fetch_top_images_for_selected_vehicle(state: clientState, vehicle_id: str) -> list[str]:
    """Obtiene top images for selected vehicle desde servicios externos."""
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
    """Entrega lote siguiente de imágenes y actualiza cursores de paginación."""
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

    platform = str(state.get("platform", "web")).strip().lower() or "web"
    if platform == "whatsapp":
        marker_block = _build_whatsapp_image_marker_block(state, vehicle_id, images)
        message = marker_block or _format_images_block(images)
        if state.get("vehicle_images_has_more"):
            message = f"{message}\n\nSi quieres ver mas imagenes, dímelo."
        else:
            message = f"{message}\n\nEstas son todas las imagenes disponibles de este vehiculo."
    else:
        message = _format_images_block(images)
        if state.get("vehicle_images_has_more"):
            message = f"{message}\n\nSi quieres ver mas imagenes, dímelo."
        else:
            message = f"{message}\n\nEstas son todas las imagenes disponibles de este vehiculo."
    return append_assistant_message(state, message)


def _respond_selected_vehicle_inventory_qa(state: clientState, user_text: str) -> clientState:
    """Responde preguntas sobre el vehiculo seleccionado (ficha BD) sin salir de confirmacion de compra."""

    vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
    selected_label = str(state.get("selected_car", "")).strip()
    include_images_option = bool(state.get("vehicle_images_last_batch"))
    if not vehicle_id:
        _debug("inventory_qa_missing_selected_id")
        question = _build_purchase_question(include_images_option=include_images_option)
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
        question = _build_purchase_question(include_images_option=include_images_option)
        return _append_assistant_blocks(state, [msg, question])

    platform = str(state.get("platform", "web")).strip().lower() or "web"
    grounded = format_vehicle_detail(detail, platform=platform)
    name = selected_label or format_vehicle_name(detail)
    body = generate_selected_vehicle_qa_response(name, grounded, user_text)
    question = _build_purchase_question(include_images_option=include_images_option)
    state["awaiting_purchase_confirmation"] = True
    _debug("answered_inventory_qa_while_awaiting_confirmation", vehicle_id=vehicle_id)
    return _append_assistant_blocks(state, [body, question])


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
    """Abre detalle de vehículo y re-sincroniza estado de compra/promos/financiamiento."""
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
        state["last_vehicle_candidates"] = []
        return append_assistant_message(state, message)

    state["selected_vehicle_id"] = vehicle_id
    state["selected_car"] = format_vehicle_name(detail)
    state["last_vehicle_candidates"] = []
    state["awaiting_purchase_confirmation"] = True
    top_images = _fetch_top_images_for_selected_vehicle(state, vehicle_id)
    _debug(
        "vehicle_selected",
        selected_vehicle_id=state["selected_vehicle_id"],
        selected_car=state["selected_car"],
        next_step="awaiting_purchase_confirmation",
    )

    platform = str(state.get("platform", "web")).strip().lower() or "web"
    grounded_vehicle_facts = format_vehicle_detail(detail, platform=platform)
    detail_narrative = generate_vehicle_detail_conversation(state["selected_car"], grounded_vehicle_facts)
    if platform == "whatsapp":
        images_block = _build_whatsapp_image_marker_block(state, vehicle_id, top_images) or _format_images_block(top_images)
    else:
        images_block = _format_images_block(top_images)
    if state.get("vehicle_images_has_more"):
        images_block = f"{images_block}\nSi quieres ver mas imagenes, dímelo."
    purchase_question = _build_purchase_question(include_images_option=bool(top_images))
    first_block = detail_narrative
    blocks: list[str] = []
    if financing_removed_notice:
        blocks.append(financing_removed_notice)
    if promotion_removed_notice:
        blocks.append(promotion_removed_notice)
    blocks.extend([first_block, images_block, purchase_question])
    return _append_assistant_blocks(state, blocks)


def _respond_available_list(
    state: clientState,
    vehicles: list[dict[str, Any]],
    *,
    unavailable_request: bool = False,
) -> clientState:
    """Muestra inventario disponible y limpia contexto de selección previa."""
    state["awaiting_purchase_confirmation"] = False
    state["last_vehicle_candidates"] = [
        item
        for item in vehicles
        if isinstance(item, dict) and str(item.get("status", "")).strip().lower() == "available"
    ][:8]
    state["selected_vehicle_id"] = ""
    state["selected_car"] = ""
    state["vehicle_comparison_ctx"] = {}
    _reset_vehicle_images_state(state)
    available_count = sum(1 for item in vehicles if str(item.get("status", "")).strip().lower() == "available")
    _debug(
        "showing_available_list",
        total_vehicles=len(vehicles),
        available_vehicles=available_count,
        pending_candidates=len(state["last_vehicle_candidates"]),
    )
    available_list = format_available_vehicles_grouped(vehicles)
    user_q = latest_user_message(state)
    verified = "\n".join(
        [
            f"consulta_usuario: {user_q}",
            f"consulta_especifica_sin_stock_conocido: {str(unavailable_request).lower()}",
            f"vehiculos_disponibles_contados: {available_count}",
            "",
            "LISTADO_INVENTARIO_AGRUPADO:",
            available_list,
            "",
            "cierre_sugerido_literal: Si quieres, te ayudo a comparar cual te conviene mas.",
        ]
    )
    message = generate_verified_user_message(
        mode="catalog_availability",
        verified_facts_block=verified,
        user_message=user_q,
        fallback=available_list,
        temperature=0.42,
    )
    return append_assistant_message(state, message)


def _respond_other_vehicles_with_optional_filters(
    state: clientState,
    vehicles: list[dict[str, Any]],
    user_text: str,
) -> clientState:
    """Resuelve `ver otros`: aplica filtros del turno o vuelve a listado general."""

    filters = detect_vehicle_filters(user_text, vehicles)
    _debug("other_vehicles_filters_detected", filters=filters)
    if not filters:
        return _respond_available_list(state, vehicles)
    return _respond_with_filtered_search(state, filters, user_text, source="other_vehicles")


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
        filtered = search_vehicles(filters)
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
    state["last_vehicle_candidates"] = filtered[:8]
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
    return available or [item for item in candidates if isinstance(item, dict)]


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
    table = format_vehicle_comparison_table(detail_a, detail_b, platform=platform)
    name_a = format_vehicle_name(detail_a)
    name_b = format_vehicle_name(detail_b)
    user_q = latest_user_message(state)
    verified = "\n".join(
        [
            "operacion: comparacion_dos_vehiculos",
            f"vehiculo_a: {name_a}",
            f"vehiculo_b: {name_b}",
            "",
            "TABLA_COMPARACION_LITERAL:",
            table,
            "",
            "cierre_literal: Dime con cual quieres continuar y te muestro ese modelo en detalle.",
        ]
    )
    message = generate_verified_user_message(
        mode="operational",
        verified_facts_block=verified,
        user_message=user_q,
        fallback=f"{table}\n\nDime con cual quieres continuar y te muestro ese modelo en detalle.",
        temperature=0.35,
    )
    return append_assistant_message(state, message)


def _comparison_prompt_first_ambiguous(
    state: clientState,
    matches: list[dict[str, Any]],
    other_query: str,
) -> clientState:
    """Pide aclarar el primer vehículo cuando hay múltiples coincidencias."""

    state["last_vehicle_candidates"] = matches[:8]
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

    state["last_vehicle_candidates"] = matches[:8]
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
            selected_detail = fetch_vehicle_by_id(selected_vehicle_id)
            if isinstance(selected_detail, dict):
                _debug(
                    "show_selected_vehicle_detail_once",
                    selected_vehicle_id=selected_vehicle_id,
                    selected_car=state.get("selected_car", ""),
                )
                return _respond_with_vehicle_detail(state, selected_detail)

    if state.get("awaiting_purchase_confirmation"):
        previous_bot_message = str(state.get("last_bot_message", "")).strip()
        selected_car_name = str(state.get("selected_car", "")).strip()
        step_flags = classify_vehicle_step_flags(previous_bot_message, user_text, selected_car_name)
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
        if step_flags.get("ask_financing") or is_financing_request(user_text, _FINANCING_SIGNALS_NORMALIZED):
            state["awaiting_purchase_confirmation"] = False
            state["current_node"] = "financing"
            _debug("route_change", next_node="financing", reason="financing_request")
            return state
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
        if step_flags.get("confirm_purchase"):
            state["awaiting_purchase_confirmation"] = False
            state["current_node"] = "lead_capture"
            _debug("route_change", next_node="lead_capture", reason="llm_flags")
            return state
        if step_flags.get("reject_purchase"):
            return _respond_available_list(state, vehicles)
        decision = classify_purchase_confirmation_intent(previous_bot_message, user_text)
        _debug(
            "purchase_confirmation_classified",
            decision=decision,
            selected_car=state.get("selected_car", ""),
        )
        if decision == "VER_MAS_IMAGENES" or is_more_images_request(user_text, _MORE_IMAGES_SIGNALS_NORMALIZED):
            return _respond_with_more_images(state)
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
        if decision == "SI":
            state["awaiting_purchase_confirmation"] = False
            state["current_node"] = "lead_capture"
            _debug("route_change", next_node="lead_capture")
            return state
        _debug("purchase_confirmation_unknown", user_text=user_text)
        question = _build_purchase_question(include_images_option=bool(state.get("vehicle_images_last_batch")))
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

    selected_pending = _find_candidate_from_pending(state, user_text)
    if selected_pending:
        vctx = state.get("vehicle_comparison_ctx")
        if isinstance(vctx, dict) and vctx:
            other_q = str(vctx.get("other_query") or "").strip()
            peer = str(vctx.get("peer_resolved_id") or "").strip()
            if other_q and not peer:
                _debug("comparison_first_pick", other_query=other_q)
                return _comparison_after_first_vehicle_chosen(state, vehicles, selected_pending, other_q)
            if peer:
                _debug("comparison_second_pick", peer_resolved_id=peer)
                return _comparison_after_second_vehicle_chosen(state, peer, selected_pending)
        _debug("continuing_from_pending_candidates")
        return _respond_with_vehicle_detail(state, selected_pending)

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
