"""Nodo de financiamiento: consulta y seleccion de plan + vehiculo."""

from __future__ import annotations

import re
from typing import Any

from src.services.llm_responses import classify_financing_plan_selection_intent, safe_llm_format
from src.state import clientState
from src.tools.database import fetch_financing_plans, fetch_financing_plans_by_vehicle
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
    format_vehicle_detail,
    format_financing_plan_vehicles,
    format_financing_plans,
    format_financing_plans_for_vehicle,
)
from src.utils.state_helpers import append_assistant_message, latest_user_message

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


def _debug(event: str, **payload: Any) -> None:
    """Imprime trazas del flujo de financiamiento para depuracion."""

    if payload:
        pairs = ", ".join(f"{key}={value!r}" for key, value in payload.items())
        print(f"[financing] {event} | {pairs}")
        return
    print(f"[financing] {event}")


def _is_financing_query(user_text: str) -> bool:
    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return any(_contains_signal_phrase(normalized, signal) for signal in _FINANCING_SIGNALS)


def _contains_signal_phrase(normalized_text: str, signal: str) -> bool:
    parts = [part for part in normalize_user_text(signal).split() if part]
    if not parts:
        return False
    pattern = r"(?<![a-z0-9])" + r"\s+".join(re.escape(part) for part in parts) + r"(?![a-z0-9])"
    return re.search(pattern, normalized_text) is not None


def _vehicle_label(item: dict[str, Any]) -> str:
    brand = str(item.get("brand", "")).strip()
    model = str(item.get("model", "")).strip()
    year = item.get("year")
    return f"{brand} {model} {year if isinstance(year, int) else ''}".strip()


def _pick_plan_from_state(state: clientState, user_text: str) -> dict[str, Any] | None:
    candidates = state.get("financing_plan_candidates", [])
    if not isinstance(candidates, list) or not candidates:
        return None
    by_index = _extract_plan_by_index(state, user_text)
    if by_index:
        return by_index
    options: list[str] = []
    mapping: dict[str, dict[str, Any]] = {}
    for item in candidates:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        lender = str(item.get("lender", "")).strip()
        if name:
            options.append(name)
            mapping[name] = item
        if lender:
            options.append(lender)
            mapping[lender] = item
        if name and lender:
            combined = f"{name} {lender}".strip()
            options.append(combined)
            mapping[combined] = item
        vehicles = _available_plan_vehicles(item)
        for vehicle in vehicles:
            label = _vehicle_label(vehicle)
            if label:
                options.append(label)
                mapping[label] = item
    selected = canonicalize_with_typo_support(user_text, options, threshold=0.7)
    if not selected:
        return None
    return mapping.get(selected)


def _extract_plan_by_index(state: clientState, user_text: str) -> dict[str, Any] | None:
    candidates = state.get("financing_plan_candidates", [])
    if not isinstance(candidates, list) or not candidates:
        return None
    normalized = normalize_user_text(user_text)
    tokens = [token for token in normalized.split(" ") if token.isdigit()]
    if not tokens:
        return None
    idx = int(tokens[0]) - 1
    if 0 <= idx < len(candidates) and isinstance(candidates[idx], dict):
        return candidates[idx]
    return None


def _pick_vehicle_for_plan(state: clientState, user_text: str) -> dict[str, Any] | None:
    candidates = state.get("financing_vehicle_candidates", [])
    if not isinstance(candidates, list) or not candidates:
        return None
    normalized = normalize_user_text(user_text)
    if normalized.isdigit():
        idx = int(normalized) - 1
        if 0 <= idx < len(candidates) and isinstance(candidates[idx], dict):
            return candidates[idx]

    options = [_vehicle_label(item) for item in candidates if isinstance(item, dict)]
    selected = canonicalize_with_typo_support(user_text, options, threshold=0.72)
    if not selected:
        return None
    for item in candidates:
        if isinstance(item, dict) and _vehicle_label(item) == selected:
            return item
    return None


def _maybe_resolve_vehicle_from_query(user_text: str) -> dict[str, Any] | None:
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
    only_available = [
        item
        for item in matches
        if isinstance(item, dict) and str(item.get("status", "")).strip().lower() == "available"
    ]
    candidates = only_available or [item for item in matches if isinstance(item, dict)]
    if len(candidates) == 1:
        return candidates[0]
    return None


def _set_selected_plan(state: clientState, plan: dict[str, Any]) -> None:
    state["selected_financing_plan_id"] = str(plan.get("id", "")).strip()
    state["selected_financing_plan_name"] = str(plan.get("name", "")).strip()
    state["selected_financing_plan_lender"] = str(plan.get("lender", "")).strip()


def _looks_like_plan_vehicle_info_request(user_text: str) -> bool:
    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    signals = {
        "como es",
        "detalles",
        "detalle",
        "info",
        "informacion",
        "vehiculo",
        "carro",
        "auto",
        "modelo",
        "imagen",
        "imagenes",
        "foto",
        "fotos",
    }
    return any(signal in normalized for signal in signals)


def _image_url_for_chat(raw_url: str) -> str:
    cleaned = str(raw_url or "").strip()
    if not cleaned:
        return ""
    if cleaned.startswith("http://") or cleaned.startswith("https://"):
        return cleaned
    return cleaned


def _build_vehicle_images_block(vehicle_id: str) -> str:
    try:
        payload = fetch_vehicle_images(vehicle_id, mode="top", limit=3)
    except Exception:
        return ""
    images = payload.get("images", [])
    if not isinstance(images, list) or not images:
        return ""
    lines = [f"- {_image_url_for_chat(url)}" for url in images if str(url).strip()]
    if not lines:
        return ""
    return "Imagenes del vehiculo:\n" + "\n".join(lines)


def _respond_plan_vehicle_info(state: clientState, plan: dict[str, Any]) -> clientState:
    plan_name = str(plan.get("name", "")).strip() or "este plan"
    vehicles = _available_plan_vehicles(plan)
    if not vehicles:
        message = safe_llm_format(
            f"El plan {plan_name} no tiene vehiculos disponibles vinculados. "
            "Si quieres, te muestro otros planes."
        )
        return append_assistant_message(state, message)

    target_vehicle = vehicles[0]
    vehicle_id = str(target_vehicle.get("id", "")).strip()
    detail = fetch_vehicle_by_id(vehicle_id) if vehicle_id else None
    detail_source = detail if isinstance(detail, dict) else target_vehicle
    vehicle_name = _vehicle_label(detail_source)
    intro = safe_llm_format(
        f"Claro, te comparto el vehiculo del {plan_name}: {vehicle_name}."
    )
    vehicle_text = format_vehicle_detail(detail_source, platform=str(state.get("platform", "web")))
    images_block = _build_vehicle_images_block(vehicle_id)
    close_question = safe_llm_format(
        f"Quieres este plan de financiamiento para {vehicle_name}? "
        "Si si, te paso a seleccionar este vehiculo y seguimos con tus datos."
    )
    blocks = [intro, vehicle_text]
    if images_block:
        blocks.append(images_block)
    blocks.append(close_question)
    return append_assistant_message(state, "\n\n".join(blocks))


def _pick_plan_for_vehicle_info(state: clientState, user_text: str) -> dict[str, Any] | None:
    selected = _pick_plan_from_state(state, user_text)
    if selected:
        return selected
    candidates = state.get("financing_plan_candidates", [])
    if not isinstance(candidates, list):
        return None
    matching: list[dict[str, Any]] = []
    normalized_user = normalize_user_text(user_text)
    for item in candidates:
        if not isinstance(item, dict):
            continue
        for vehicle in _available_plan_vehicles(item):
            if normalize_user_text(_vehicle_label(vehicle)) in normalized_user:
                matching.append(item)
                break
    if len(matching) == 1:
        return matching[0]
    return None


def _available_plan_vehicles(plan: dict[str, Any]) -> list[dict[str, Any]]:
    vehicles = plan.get("vehicles")
    raw_items = [item for item in vehicles if isinstance(item, dict)] if isinstance(vehicles, list) else []
    filtered: list[dict[str, Any]] = []
    for item in raw_items:
        status = str(item.get("status", "")).strip().lower()
        if status and status != "available":
            continue
        filtered.append(item)
    return filtered


def _filter_plans_with_available_vehicles(plans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    valid_plans: list[dict[str, Any]] = []
    for item in plans:
        if not isinstance(item, dict):
            continue
        if not bool(item.get("active", True)):
            continue
        vehicles = _available_plan_vehicles(item)
        if not vehicles:
            continue
        normalized = dict(item)
        normalized["vehicles"] = vehicles
        valid_plans.append(normalized)
    return valid_plans


def financing(state: clientState) -> clientState:
    """Consulta planes y obliga seleccion de vehiculo dentro del plan."""

    state["current_node"] = "financing"
    user_text = latest_user_message(state)
    _debug(
        "entry",
        user_text=user_text,
        awaiting_financing_plan_selection=bool(state.get("awaiting_financing_plan_selection")),
        awaiting_financing_vehicle_selection=bool(state.get("awaiting_financing_vehicle_selection")),
        selected_vehicle_id=str(state.get("selected_vehicle_id", "")).strip(),
        selected_car=str(state.get("selected_car", "")).strip(),
    )

    # Si el usuario hace una nueva consulta de financiamiento por vehiculo
    # mientras esperabamos seleccion de plan, reiniciamos ese tramo del flujo
    # para evitar seleccionar un plan previo de forma implicita.
    refreshed_vehicle_hint = _maybe_resolve_vehicle_from_query(user_text)
    if (
        state.get("awaiting_financing_plan_selection")
        and refreshed_vehicle_hint
        and _is_financing_query(user_text)
    ):
        refreshed_vehicle_id = str(refreshed_vehicle_hint.get("id", "")).strip()
        refreshed_car = _vehicle_label(refreshed_vehicle_hint)
        state["awaiting_financing_plan_selection"] = False
        state["selected_financing_plan_id"] = ""
        state["selected_financing_plan_name"] = ""
        state["selected_financing_plan_lender"] = ""
        state["financing_plan_candidates"] = []
        state["selected_vehicle_id"] = refreshed_vehicle_id
        state["selected_car"] = refreshed_car
        _debug(
            "financing_query_vehicle_refresh",
            selected_vehicle_id=refreshed_vehicle_id,
            selected_car=refreshed_car,
        )

    if state.get("awaiting_financing_vehicle_selection"):
        selected_vehicle = _pick_vehicle_for_plan(state, user_text)
        if not selected_vehicle:
            _debug("awaiting_vehicle_selection_invalid_choice", user_text=user_text)
            reminder = safe_llm_format(
                "Necesito que selecciones uno de los vehiculos del plan. Puedes responder con nombre o numero."
            )
            return append_assistant_message(state, reminder)

        selected_vehicle_id = str(selected_vehicle.get("id", "")).strip()
        selected_car = _vehicle_label(selected_vehicle)
        state["selected_vehicle_id"] = selected_vehicle_id
        state["selected_car"] = selected_car
        state["awaiting_financing_vehicle_selection"] = False
        state["financing_vehicle_candidates"] = []
        state["awaiting_purchase_confirmation"] = False
        state["last_vehicle_candidates"] = []
        state["intent"] = "lead_capture"
        state["current_node"] = "lead_capture"
        _debug(
            "route_change",
            next_node="lead_capture",
            selected_vehicle_id=selected_vehicle_id,
            selected_car=selected_car,
            selected_plan=state.get("selected_financing_plan_name", ""),
        )
        confirmation = safe_llm_format(
            f"Perfecto, entonces avanzamos con {selected_car} y el plan {state.get('selected_financing_plan_name', 'seleccionado')}."
        )
        return append_assistant_message(state, confirmation)

    if state.get("awaiting_financing_plan_selection"):
        if _looks_like_plan_vehicle_info_request(user_text):
            selected_plan_for_info = _pick_plan_for_vehicle_info(state, user_text)
            if selected_plan_for_info:
                _debug(
                    "plan_vehicle_info_requested",
                    plan_name=str(selected_plan_for_info.get("name", "")).strip(),
                )
                return _respond_plan_vehicle_info(state, selected_plan_for_info)
        selected_plan = _pick_plan_from_state(state, user_text)
        if not selected_plan:
            candidates = state.get("financing_plan_candidates", [])
            if (
                isinstance(candidates, list)
                and len(candidates) == 1
                and isinstance(candidates[0], dict)
            ):
                unique_plan = candidates[0]
                plan_name = str(unique_plan.get("name", "")).strip()
                selection_intent = classify_financing_plan_selection_intent(
                    previous_bot_message=str(state.get("last_bot_message", "")).strip(),
                    user_message=user_text,
                    plan_count=1,
                    single_plan_name=plan_name,
                )
                _debug(
                    "single_plan_selection_intent",
                    intent=selection_intent,
                    user_text=user_text,
                    plan_name=plan_name,
                )
                if selection_intent == "SELECT_SINGLE_PLAN":
                    selected_plan = unique_plan
        if not selected_plan:
            _debug("awaiting_plan_selection_invalid_choice", user_text=user_text)
            reminder = safe_llm_format(
                "Dime cual plan te interesa (por nombre o numero) para continuar."
            )
            return append_assistant_message(state, reminder)

        _set_selected_plan(state, selected_plan)
        state["awaiting_financing_plan_selection"] = False
        _debug(
            "plan_selected",
            plan_id=state.get("selected_financing_plan_id", ""),
            plan_name=state.get("selected_financing_plan_name", ""),
            lender=state.get("selected_financing_plan_lender", ""),
        )
        plan_vehicles = _available_plan_vehicles(selected_plan)
        if plan_vehicles:
            if len(plan_vehicles) == 1:
                only_vehicle = plan_vehicles[0]
                selected_vehicle_id = str(only_vehicle.get("id", "")).strip()
                selected_car = _vehicle_label(only_vehicle)
                preselected_id = str(state.get("selected_vehicle_id", "")).strip()
                if preselected_id and preselected_id == selected_vehicle_id:
                    state["selected_vehicle_id"] = selected_vehicle_id
                    state["selected_car"] = selected_car
                    state["awaiting_financing_vehicle_selection"] = False
                    state["financing_vehicle_candidates"] = []
                    state["last_vehicle_candidates"] = []
                    state["awaiting_purchase_confirmation"] = False
                    state["show_selected_vehicle_detail_once"] = False
                    state["intent"] = "lead_capture"
                    state["current_node"] = "lead_capture"
                    _debug(
                        "single_vehicle_matches_preselected",
                        selected_vehicle_id=selected_vehicle_id,
                        selected_car=selected_car,
                        selected_plan=state.get("selected_financing_plan_name", ""),
                    )
                    _debug(
                        "route_change",
                        next_node="lead_capture",
                        reason="plan_confirmed_same_vehicle_already_selected",
                    )
                    confirmation = safe_llm_format(
                        f"Perfecto, entonces avanzamos con {selected_car} y el plan "
                        f"{state.get('selected_financing_plan_name', 'seleccionado')}."
                    )
                    return append_assistant_message(state, confirmation)
                state["selected_vehicle_id"] = selected_vehicle_id
                state["selected_car"] = selected_car
                state["awaiting_financing_vehicle_selection"] = False
                state["financing_vehicle_candidates"] = []
                state["awaiting_purchase_confirmation"] = False
                state["last_vehicle_candidates"] = []
                state["intent"] = "vehicle_catalog"
                state["current_node"] = "car_selection"
                state["show_selected_vehicle_detail_once"] = True
                _debug(
                    "single_vehicle_auto_selected",
                    selected_vehicle_id=selected_vehicle_id,
                    selected_car=selected_car,
                    selected_plan=state.get("selected_financing_plan_name", ""),
                )
                _debug("route_change", next_node="car_selection", reason="single_vehicle_in_plan")
                return state

            normalized_plan = dict(selected_plan)
            normalized_plan["vehicles"] = plan_vehicles
            state["financing_vehicle_candidates"] = plan_vehicles
            state["awaiting_financing_vehicle_selection"] = True
            _debug("awaiting_vehicle_selection_enabled", candidates=len(plan_vehicles))
            vehicle_picker = format_financing_plan_vehicles(normalized_plan)
            question = safe_llm_format(
                f"{vehicle_picker}\n\nCuando lo elijas, paso a capturar tus datos para que un asesor te contacte."
            )
            return append_assistant_message(state, question)

        _debug("selected_plan_without_vehicles")
        fallback = safe_llm_format(
            "Este plan no trae vehiculos vinculados. Dime marca y modelo del carro que te interesa para continuar."
        )
        return append_assistant_message(state, fallback)

    selected_vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
    selected_car = str(state.get("selected_car", "")).strip()

    vehicle_hint = _maybe_resolve_vehicle_from_query(user_text)
    if vehicle_hint and not selected_vehicle_id:
        selected_vehicle_id = str(vehicle_hint.get("id", "")).strip()
        selected_car = _vehicle_label(vehicle_hint)
        state["selected_vehicle_id"] = selected_vehicle_id
        state["selected_car"] = selected_car
        _debug("vehicle_hint_resolved", selected_vehicle_id=selected_vehicle_id, selected_car=selected_car)

    if selected_vehicle_id and (_is_financing_query(user_text) or selected_car):
        try:
            plans_for_vehicle = fetch_financing_plans_by_vehicle(selected_vehicle_id)
        except Exception:
            _debug("plans_for_vehicle_fetch_error", selected_vehicle_id=selected_vehicle_id)
            plans_for_vehicle = []
        plans_for_vehicle = _filter_plans_with_available_vehicles(plans_for_vehicle)
        if plans_for_vehicle:
            state["financing_plan_candidates"] = plans_for_vehicle
            state["awaiting_financing_plan_selection"] = True
            _debug(
                "plans_for_vehicle_loaded",
                selected_vehicle_id=selected_vehicle_id,
                plans=len(plans_for_vehicle),
            )
            platform = str(state.get("platform", "web")).strip().lower() or "web"
            message = format_financing_plans_for_vehicle(
                selected_car or "este vehiculo",
                plans_for_vehicle,
                platform=platform,
            )
            has_single_plan = len(plans_for_vehicle) == 1
            follow_up = (
                "Te interesa este plan? No olvides en preguntarme cualquier duda."
                if has_single_plan
                else "Si te interesa alguno, dime el nombre o numero del plan."
            )
            question = safe_llm_format(
                f"{message}\n\n{follow_up}"
            )
            return append_assistant_message(state, question)

    try:
        plans = fetch_financing_plans()
    except Exception:
        _debug("plans_fetch_error")
        plans = []
    plans = _filter_plans_with_available_vehicles(plans)

    if not plans:
        _debug("plans_unavailable")
        message = safe_llm_format(
            "No hay planes de financiamiento con vehiculos disponibles en este momento. "
            "Si quieres, puedo pasarte con un asesor para revisar opciones."
        )
        return append_assistant_message(state, message)

    state["financing_plan_candidates"] = plans
    state["awaiting_financing_plan_selection"] = True
    _debug("plans_loaded", total_plans=len(plans))
    platform = str(state.get("platform", "web")).strip().lower() or "web"
    listing = format_financing_plans(plans, platform=platform)
    prompt = (
        f"{listing}\n\nSi te interesa uno en particular, dime el nombre o numero del plan."
        " Despues te pedire seleccionar el vehiculo dentro de ese plan."
    )
    return append_assistant_message(state, safe_llm_format(prompt))
