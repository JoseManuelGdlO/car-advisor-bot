"""Nodo de promociones: listar, validar aplicacion explicita y confirmar interes."""

from __future__ import annotations

from typing import Any

from src.services.llm_responses import (
    classify_promotions_step_flags,
    classify_promotion_selection_intent,
    safe_llm_format,
)
from src.state import clientState
from src.tools.database import fetch_promotions, fetch_promotions_by_vehicle
from src.tools.vehicles import (
    canonicalize_with_typo_support,
    detect_vehicle_filters,
    fetch_vehicle_by_id,
    fetch_vehicles,
    normalize_user_text,
    search_vehicles,
)
from src.utils.formatters import format_promotions, format_vehicle_detail
from src.utils.state_helpers import append_assistant_message, latest_user_message

_YES_SIGNALS = {"si", "sí", "claro", "acepto", "me interesa", "quiero", "va", "dale"}
_NO_SIGNALS = {"no", "nel", "paso", "no gracias", "ya no", "mejor no"}


def _debug(event: str, **payload: Any) -> None:
    """Centraliza trazas de depuracion para este nodo."""
    if payload:
        pairs = ", ".join(f"{key}={value!r}" for key, value in payload.items())
        print(f"[promotions] {event} | {pairs}")
        return
    print(f"[promotions] {event}")


def _is_vehicle_info_request(user_text: str) -> bool:
    """Retorna True cuando is vehicle info request."""
    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    signals = {"vehiculo", "carro", "auto", "modelo", "detalles", "detalle", "ver", "mostrar", "informacion"}
    return any(signal in normalized for signal in signals)


def _vehicle_label(item: dict[str, Any]) -> str:
    """Helper de apoyo para vehicle label."""
    brand = str(item.get("brand", "")).strip()
    model = str(item.get("model", "")).strip()
    year = item.get("year")
    return f"{brand} {model} {year if isinstance(year, int) else ''}".strip()


def _filter_active_promotions(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Filtra active promotions segun criterios de negocio."""
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        if not bool(item.get("active", True)):
            continue
        out.append(item)
    return out


def _set_selected_promotion(state: clientState, promotion: dict[str, Any]) -> None:
    """Actualiza selected promotion en el estado de la conversacion."""
    state["selected_promotion_id"] = str(promotion.get("id", "")).strip()
    state["selected_promotion_title"] = str(promotion.get("title", "")).strip()
    state["selected_promotion_description"] = str(promotion.get("description", "")).strip()
    state["selected_promotion_valid_until"] = str(promotion.get("validUntil", "")).strip()
    raw_vehicle_ids = promotion.get("vehicleIds")
    vehicle_ids = [str(item).strip() for item in raw_vehicle_ids if str(item).strip()] if isinstance(raw_vehicle_ids, list) else []
    state["selected_promotion_vehicle_ids"] = vehicle_ids


def _extract_by_index(candidates: list[dict[str, Any]], user_text: str) -> dict[str, Any] | None:
    """Extrae by index desde la entrada del usuario."""
    normalized = normalize_user_text(user_text)
    tokens = [token for token in normalized.split(" ") if token.isdigit()]
    if not tokens:
        return None
    idx = int(tokens[0]) - 1
    if 0 <= idx < len(candidates):
        candidate = candidates[idx]
        if isinstance(candidate, dict):
            return candidate
    return None


def _pick_promotion_from_state(state: clientState, user_text: str) -> dict[str, Any] | None:
    """Selecciona promotion from state con reglas del flujo."""
    candidates = state.get("promotion_candidates", [])
    if not isinstance(candidates, list) or not candidates:
        return None
    dict_candidates = [item for item in candidates if isinstance(item, dict)]
    if len(dict_candidates) == 1:
        return dict_candidates[0]
    by_index = _extract_by_index(dict_candidates, user_text)
    if by_index:
        return by_index
    options: list[str] = []
    mapping: dict[str, dict[str, Any]] = {}
    for item in candidates:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        description = str(item.get("description", "")).strip()
        if title:
            options.append(title)
            mapping[title] = item
        if description:
            options.append(description)
            mapping[description] = item
    selected = canonicalize_with_typo_support(user_text, options, threshold=0.7)
    if not selected:
        return None
    return mapping.get(selected)


def _maybe_resolve_vehicle_from_query(user_text: str) -> dict[str, Any] | None:
    """Helper de apoyo para maybe resolve vehicle from query."""
    try:
        catalog = fetch_vehicles()
    except Exception:
        return None
    filters = detect_vehicle_filters(user_text, catalog)
    if not filters:
        return None
    try:
        matches = search_vehicles(filters)
    except Exception:
        return None
    candidates = [item for item in matches if isinstance(item, dict)]
    if len(candidates) == 1:
        return candidates[0]
    return None


def _looks_like_explicit_apply(user_text: str) -> bool:
    """Detecta si el texto parece explicit apply."""
    normalized = normalize_user_text(user_text)
    explicit_signals = {
        "aplicar",
        "quiero esa promocion",
        "quiero aplicar",
        "si quiero la promocion",
        "tomar promocion",
    }
    return any(signal in normalized for signal in explicit_signals)


def _pick_vehicle_candidate(state: clientState, user_text: str) -> dict[str, Any] | None:
    """Selecciona vehicle candidate con reglas del flujo."""
    candidates = state.get("promotion_vehicle_candidates", [])
    if not isinstance(candidates, list) or not candidates:
        return None
    by_index = _extract_by_index([item for item in candidates if isinstance(item, dict)], user_text)
    if by_index:
        return by_index
    labels = [_vehicle_label(item) for item in candidates if isinstance(item, dict)]
    selected = canonicalize_with_typo_support(user_text, labels, threshold=0.72)
    if not selected:
        return None
    for item in candidates:
        if isinstance(item, dict) and _vehicle_label(item) == selected:
            return item
    return None


def _load_promotion_vehicles(state: clientState, promotion: dict[str, Any]) -> list[dict[str, Any]]:
    """Helper de apoyo para load promotion vehicles."""
    ids = promotion.get("vehicleIds")
    if not isinstance(ids, list):
        return []
    resolved: list[dict[str, Any]] = []
    for raw_id in ids:
        vehicle_id = str(raw_id).strip()
        if not vehicle_id:
            continue
        try:
            detail = fetch_vehicle_by_id(vehicle_id)
        except Exception:
            detail = None
        if isinstance(detail, dict):
            resolved.append(detail)
    available_only = [item for item in resolved if str(item.get("status", "")).strip().lower() == "available"]
    return available_only or resolved


def _show_vehicle_and_confirm_interest(state: clientState, vehicle: dict[str, Any]) -> clientState:
    """Helper de apoyo para show vehicle and confirm interest."""
    vehicle_id = str(vehicle.get("id", "")).strip()
    state["selected_vehicle_id"] = vehicle_id
    state["selected_car"] = _vehicle_label(vehicle)
    state["awaiting_promotion_vehicle_interest_confirmation"] = True
    state["awaiting_promotion_vehicle_selection"] = False
    detail = format_vehicle_detail(vehicle, platform=str(state.get("platform", "web")))
    promotion_title = str(state.get("selected_promotion_title", "")).strip() or "esta promocion"
    question = safe_llm_format(
        f"Este es el vehiculo aplicable a {promotion_title}. "
        "Te interesa este vehiculo con la promocion? Si me confirmas, avanzamos con tus datos."
    )
    return append_assistant_message(state, f"{detail}\n\n{question}")


def _promotion_vehicle_labels(promotion: dict[str, Any]) -> list[str]:
    """Helper de apoyo para promotion vehicle labels."""
    raw_ids = promotion.get("vehicleIds")
    if not isinstance(raw_ids, list):
        return []
    labels: list[str] = []
    for raw_id in raw_ids:
        vehicle_id = str(raw_id).strip()
        if not vehicle_id:
            continue
        try:
            detail = fetch_vehicle_by_id(vehicle_id)
        except Exception:
            detail = None
        if not isinstance(detail, dict):
            continue
        labels.append(_vehicle_label(detail))
    return labels


def _hydrate_promotions_with_vehicle_labels(promotions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Helper de apoyo para hydrate promotions with vehicle labels."""
    hydrated: list[dict[str, Any]] = []
    for item in promotions:
        if not isinstance(item, dict):
            continue
        if not bool(item.get("active", True)):
            continue
        row = dict(item)
        vehicle_labels = _promotion_vehicle_labels(item)
        if not vehicle_labels:
            continue
        row["vehicleLabels"] = vehicle_labels
        hydrated.append(row)
    return hydrated


def _respond_promotion_listing(state: clientState, promotions: list[dict[str, Any]]) -> clientState:
    """Genera una respuesta para promotion listing."""
    platform = str(state.get("platform", "web")).strip().lower() or "web"
    hydrated_promotions = _hydrate_promotions_with_vehicle_labels(promotions)
    if not hydrated_promotions:
        state["promotion_candidates"] = []
        state["awaiting_promotion_selection"] = False
        return append_assistant_message(
            state,
            safe_llm_format("No hay promociones disponibles para aplicar en este momento."),
        )
    listing = format_promotions(hydrated_promotions, platform=platform)
    prompt = safe_llm_format(
        f"{listing}\n\nSi quieres aplicar una, dime cual y confirmame explicitamente que deseas aplicarla."
    )
    state["promotion_candidates"] = hydrated_promotions
    state["awaiting_promotion_selection"] = True
    return append_assistant_message(state, prompt)


def promotions(state: clientState) -> clientState:
    """Gestiona promociones generales o por vehiculo, y confirma interes antes de lead_capture."""

    state["current_node"] = "promotions"
    user_text = latest_user_message(state)
    _debug(
        "entry",
        user_text=user_text,
        awaiting_promotion_selection=bool(state.get("awaiting_promotion_selection")),
        awaiting_promotion_vehicle_selection=bool(state.get("awaiting_promotion_vehicle_selection")),
        awaiting_interest=bool(state.get("awaiting_promotion_vehicle_interest_confirmation")),
        selected_vehicle_id=str(state.get("selected_vehicle_id", "")).strip(),
    )
    nav_flags = classify_promotions_step_flags(
        user_message=user_text,
        current_promotion_title=str(state.get("selected_promotion_title", "")).strip(),
    )
    _debug("nav_flags", **nav_flags)

    if nav_flags.get("ask_financing"):
        state["current_node"] = "financing"
        state["intent"] = "financing"
        _debug("route_change", next_node="financing", reason="financing_requested")
        return state

    if nav_flags.get("ask_other_vehicles") and not nav_flags.get("ask_promotions"):
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        _debug("route_change", next_node="car_selection", reason="other_cars_requested")
        return state

    if state.get("awaiting_promotion_vehicle_interest_confirmation"):
        normalized = normalize_user_text(user_text)
        if nav_flags.get("confirm_no") or any(signal in normalized for signal in _NO_SIGNALS):
            state["awaiting_promotion_vehicle_interest_confirmation"] = False
            state["selected_vehicle_id"] = ""
            state["selected_car"] = ""
            try:
                promotions_list = _filter_active_promotions(fetch_promotions())
            except Exception:
                promotions_list = []
            if not promotions_list:
                return append_assistant_message(
                    state,
                    safe_llm_format("Entendido. En este momento no tengo mas promociones activas para mostrarte."),
                )
            return _respond_promotion_listing(state, promotions_list)
        if nav_flags.get("confirm_yes") or any(signal in normalized for signal in _YES_SIGNALS):
            state["awaiting_promotion_vehicle_interest_confirmation"] = False
            state["current_node"] = "lead_capture"
            state["intent"] = "lead_capture"
            return append_assistant_message(
                state,
                safe_llm_format("Perfecto, avancemos con tus datos para aplicar la promocion a este vehiculo."),
            )
        return append_assistant_message(
            state,
            safe_llm_format("Solo confirmame si te interesa este vehiculo con la promocion (si o no)."),
        )

    if state.get("awaiting_promotion_vehicle_selection"):
        selected_vehicle = _pick_vehicle_candidate(state, user_text)
        if not selected_vehicle:
            return append_assistant_message(
                state,
                safe_llm_format("Elige uno de los vehiculos aplicables por nombre o numero para continuar."),
            )
        return _show_vehicle_and_confirm_interest(state, selected_vehicle)

    if state.get("awaiting_promotion_selection"):
        selected_promotion = _pick_promotion_from_state(state, user_text)
        if not selected_promotion:
            return append_assistant_message(
                state,
                safe_llm_format(
                    "Dime cual promocion te interesa por nombre o numero. "
                    "Si quieres aplicarla, confirmalo explicitamente."
                ),
            )

        _set_selected_promotion(state, selected_promotion)
        has_explicit_apply = _looks_like_explicit_apply(user_text)
        if not has_explicit_apply and len(state.get("promotion_candidates", [])) == 1:
            classify = classify_promotion_selection_intent(
                previous_bot_message=str(state.get("last_bot_message", "")).strip(),
                user_message=user_text,
                promotion_count=1,
                single_promotion_title=str(state.get("selected_promotion_title", "")).strip(),
            )
            has_explicit_apply = classify == "APPLY_SINGLE_PROMOTION"

        if not has_explicit_apply and not _is_vehicle_info_request(user_text):
            title = str(state.get("selected_promotion_title", "")).strip() or "esa promocion"
            return append_assistant_message(
                state,
                safe_llm_format(
                    f"Perfecto, identifique {title}. Para seleccionarla, necesito que me confirmes explicitamente "
                    "si deseas aplicarla a tu compra."
                ),
            )

        if _is_vehicle_info_request(user_text):
            promotion_vehicles = _load_promotion_vehicles(state, selected_promotion)
            hinted_vehicle = _maybe_resolve_vehicle_from_query(user_text)
            if isinstance(hinted_vehicle, dict):
                hinted_id = str(hinted_vehicle.get("id", "")).strip()
                if hinted_id:
                    for candidate in promotion_vehicles:
                        candidate_id = str(candidate.get("id", "")).strip()
                        if candidate_id and candidate_id == hinted_id:
                            state["selected_vehicle_id"] = hinted_id
                            state["selected_car"] = _vehicle_label(candidate)
                            state["show_selected_vehicle_detail_once"] = True
                            state["current_node"] = "car_selection"
                            state["intent"] = "vehicle_catalog"
                            _debug(
                                "route_change",
                                next_node="car_selection",
                                reason="vehicle_info_requested_with_hint",
                                selected_vehicle_id=hinted_id,
                            )
                            return state
            if len(promotion_vehicles) == 1:
                only_vehicle = promotion_vehicles[0]
                only_vehicle_id = str(only_vehicle.get("id", "")).strip()
                if only_vehicle_id:
                    state["selected_vehicle_id"] = only_vehicle_id
                    state["selected_car"] = _vehicle_label(only_vehicle)
                    state["show_selected_vehicle_detail_once"] = True
                state["current_node"] = "car_selection"
                state["intent"] = "vehicle_catalog"
                _debug(
                    "route_change",
                    next_node="car_selection",
                    reason="vehicle_info_requested_single_candidate",
                    selected_vehicle_id=only_vehicle_id,
                )
                return state
            if len(promotion_vehicles) > 1:
                state["promotion_vehicle_candidates"] = promotion_vehicles
                state["awaiting_promotion_vehicle_selection"] = True
                options = "\n".join(
                    f"{idx}. {_vehicle_label(item)}"
                    for idx, item in enumerate(promotion_vehicles, start=1)
                )
                return append_assistant_message(
                    state,
                    safe_llm_format(
                        f"Esta promocion aplica a varios vehiculos:\n{options}\n\n"
                        "Dime cual quieres ver por nombre o numero."
                    ),
                )

        promotion_vehicles = _load_promotion_vehicles(state, selected_promotion)
        if not promotion_vehicles:
            state["awaiting_promotion_selection"] = True
            return append_assistant_message(
                state,
                safe_llm_format(
                    "Esta promocion no tiene vehiculos disponibles en este momento. "
                    "Si quieres, te muestro otras promociones."
                ),
            )

        state["awaiting_promotion_selection"] = False
        state["promotion_vehicle_candidates"] = promotion_vehicles
        if len(promotion_vehicles) == 1:
            return _show_vehicle_and_confirm_interest(state, promotion_vehicles[0])

        options = "\n".join(f"{idx}. {_vehicle_label(item)}" for idx, item in enumerate(promotion_vehicles, start=1))
        state["awaiting_promotion_vehicle_selection"] = True
        message = safe_llm_format(
            f"Estos son los vehiculos aplicables a la promocion:\n{options}\n\n"
            "Cual quieres revisar primero?"
        )
        return append_assistant_message(state, message)

    selected_vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
    vehicle_hint = _maybe_resolve_vehicle_from_query(user_text)
    if vehicle_hint and not selected_vehicle_id:
        selected_vehicle_id = str(vehicle_hint.get("id", "")).strip()
        state["selected_vehicle_id"] = selected_vehicle_id
        state["selected_car"] = _vehicle_label(vehicle_hint)

    if selected_vehicle_id and (nav_flags.get("ask_promotions") or state.get("selected_car")):
        try:
            by_vehicle = _filter_active_promotions(fetch_promotions_by_vehicle(selected_vehicle_id))
        except Exception:
            by_vehicle = []
        if by_vehicle:
            hydrated_promotions = _hydrate_promotions_with_vehicle_labels(by_vehicle)
            if not hydrated_promotions:
                state["current_node"] = "car_selection"
                state["intent"] = "vehicle_catalog"
                return append_assistant_message(
                    state,
                    safe_llm_format(
                        "No encontre promociones con vehiculos aplicables para ese vehiculo en este momento. "
                    ),
                )
            state["promotion_candidates"] = hydrated_promotions
            state["awaiting_promotion_selection"] = True
            car_name = str(state.get("selected_car", "")).strip() or "este vehiculo"
            listing = format_promotions(hydrated_promotions, platform=str(state.get("platform", "web")))
            question = safe_llm_format(
                f"Estas son las promociones para {car_name}:\n{listing}\n\n"
                "Si deseas aplicar una, dime cual y confirmalo explicitamente."
            )
            return append_assistant_message(state, question)
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        return append_assistant_message(
            state,
            safe_llm_format(
                "No encontre promociones para ese vehiculo en este momento. "
                "Regresamos al paso anterior para seguir revisando opciones."
            ),
        )

    try:
        promotions_list = _filter_active_promotions(fetch_promotions())
    except Exception:
        promotions_list = []
    if not promotions_list:
        return append_assistant_message(
            state,
            safe_llm_format("No hay promociones disponibles en este momento. Si quieres, revisamos vehiculos o financiamiento."),
        )
    return _respond_promotion_listing(state, promotions_list)