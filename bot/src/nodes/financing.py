"""Nodo de financiamiento: consulta y seleccion de plan + vehiculo."""

from __future__ import annotations

import json
import re
from typing import Any

from src.services.llm_responses import (
    classify_financing_plan_comparison_payload,
    classify_financing_step_flags,
    classify_financing_plan_selection_intent,
    extract_financing_plan_selection_payload,
    generate_financing_plans_user_message,
    generate_verified_user_message,
)
from src.state import clientState
from src.tools.database import fetch_financing_plans, fetch_financing_plans_by_vehicle
from src.tools.vehicles import (
    canonicalize_with_typo_support,
    normalize_user_text,
    resolve_single_vehicle_from_text,
)
from src.utils.formatters import (
    format_financing_plan_comparison,
    format_financing_plan_vehicles,
    format_financing_plans,
    format_financing_plans_for_vehicle,
    format_vehicle_name,
)
from src.utils.signals import (
    PROMOTION_TOKEN_STOPWORDS,
)
from src.utils.vehicle_images import reset_vehicle_images_state
from src.utils.app_logging import get_app_logger, log_flow_trace
from src.utils.financing_advisor_notify import (
    append_down_payment_faq_if_applicable,
    is_generic_down_payment_only_question,
    maybe_escalate_financing_detail,
    resolve_down_payment_message,
)
from src.utils.state_helpers import append_assistant_message, latest_user_message

_log = get_app_logger("financing")


def _debug(event: str, **payload: Any) -> None:
    """Trazas del flujo de financiamiento; payload completo solo con LOG_LEVEL=debug."""

    log_flow_trace(_log, "financing", event, **payload)


def _return_plan_listing(state: clientState, message: str, user_text: str) -> clientState:
    """Muestra planes, FAQ de enganche si aplica, y escala a asesor tras publicar el catalogo."""

    state = append_assistant_message(state, message)
    state = append_down_payment_faq_if_applicable(state, user_text)
    escalated = maybe_escalate_financing_detail(
        state,
        trigger="financing_after_plans",
        user_message=user_text,
        apply_catalog_request_skip=False,
    )
    if escalated is not None:
        _debug("escalated_after_plan_listing", user_text=user_text)
        return escalated
    return state


def _digit_message_selects_financing_plan(
    state: clientState, user_text: str, selected_plan: dict[str, Any]
) -> bool:
    """True si el mensaje es solo un indice numerico de la lista de planes (no debe reusarse como indice de vehiculo)."""
    candidates = state.get("financing_plan_candidates", [])
    if not isinstance(candidates, list) or not candidates or not isinstance(selected_plan, dict):
        return False
    normalized = normalize_user_text(user_text)
    if not normalized.isdigit():
        return False
    idx = int(normalized) - 1
    if idx < 0 or idx >= len(candidates):
        return False
    picked = candidates[idx]
    if not isinstance(picked, dict):
        return False
    return str(picked.get("id", "")).strip() == str(selected_plan.get("id", "")).strip()


def _plan_has_available_vehicle_row(plan: dict[str, Any]) -> bool:
    vehicles = plan.get("vehicles")
    if not isinstance(vehicles, list):
        return False
    for v in vehicles:
        if isinstance(v, dict) and str(v.get("status", "")).strip().lower() in ("", "available"):
            return True
    return False


def _plan_covers_vehicle_id(plan: dict[str, Any], vehicle_id: str) -> bool:
    vid = str(vehicle_id or "").strip()
    if not vid:
        return False
    vehicles = plan.get("vehicles")
    if not isinstance(vehicles, list):
        return False
    for v in vehicles:
        if not isinstance(v, dict):
            continue
        if str(v.get("id", "")).strip() != vid:
            continue
        if str(v.get("status", "")).strip().lower() in ("", "available"):
            return True
    return False


def _financing_plans_for_comparison(state: clientState, candidates: list[Any]) -> list[dict[str, Any]]:
    active = [p for p in candidates if isinstance(p, dict) and bool(p.get("active", True))]
    vid = str(state.get("selected_vehicle_id", "")).strip()
    if not vid:
        return [p for p in active if _plan_has_available_vehicle_row(p)]
    filtered = [p for p in active if _plan_covers_vehicle_id(p, vid)]
    return filtered if filtered else [p for p in active if _plan_has_available_vehicle_row(p)]


def _numbered_financing_plan_lines(plans: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for idx, p in enumerate(plans, start=1):
        name = str(p.get("name", "")).strip() or f"Plan {idx}"
        lender = str(p.get("lender", "")).strip()
        lines.append(f"{idx}. {name} ({lender})" if lender else f"{idx}. {name}")
    return "\n".join(lines)


def _resolve_two_financing_plans_for_compare(
    plans: list[dict[str, Any]], payload: dict[str, Any]
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    il, ir = payload.get("index_left"), payload.get("index_right")
    if isinstance(il, (int, float)) and not isinstance(il, bool) and int(il) == il:
        il = int(il)
    else:
        il = None
    if isinstance(ir, (int, float)) and not isinstance(ir, bool) and int(ir) == ir:
        ir = int(ir)
    else:
        ir = None
    if isinstance(il, int) and isinstance(ir, int):
        i, j = il - 1, ir - 1
        if 0 <= i < len(plans) and 0 <= j < len(plans) and i != j:
            return plans[i], plans[j]
    nl = str(payload.get("name_left") or "").strip().lower()
    nr = str(payload.get("name_right") or "").strip().lower()
    if not nl or not nr:
        return None, None

    def _match(fragment: str) -> dict[str, Any] | None:
        for p in plans:
            name = str(p.get("name", "")).strip().lower()
            lender = str(p.get("lender", "")).strip().lower()
            if fragment in name or fragment in lender or name in fragment or lender in fragment:
                return p
        return None

    pa = _match(nl)
    pb = _match(nr)
    if pa and pb and str(pa.get("id", "")).strip() != str(pb.get("id", "")).strip():
        return pa, pb
    return None, None


def _try_compare_financing_plans_reply(
    state: clientState,
    user_text: str,
    candidates: list[Any],
) -> clientState | None:
    """Si el usuario compara dos planes, responde con tabla; si no aplica, None."""

    c_plans = _financing_plans_for_comparison(state, candidates)
    if len(c_plans) < 2:
        return None
    plan_lines = _numbered_financing_plan_lines(c_plans)
    comp_payload = classify_financing_plan_comparison_payload(
        previous_bot_message=str(state.get("last_bot_message", "")).strip(),
        user_message=user_text,
        numbered_plan_lines=plan_lines,
    )
    if not comp_payload.get("wants_compare"):
        return None
    pa, pb = _resolve_two_financing_plans_for_compare(c_plans, comp_payload)
    if not pa or not pb:
        return None
    platform = str(state.get("platform", "web")).strip().lower() or "web"
    table = format_financing_plan_comparison(pa, pb, platform=platform)
    verified = "\n".join(
        [
            "operacion: comparacion_planes_financiamiento",
            f"plan_a: {str(pa.get('name', '')).strip()}",
            f"plan_b: {str(pb.get('name', '')).strip()}",
            "",
            "TABLA_COMPARACION_LITERAL:",
            table,
            "",
            "cierre_literal: Dime cual plan prefieres (por nombre o numero) para continuar.",
        ]
    )
    msg = generate_verified_user_message(
        mode="operational",
        verified_facts_block=verified,
        user_message=user_text,
        fallback=(
            f"{table}\n\n"
            "Dime cual plan prefieres (por nombre o numero) para continuar."
        ),
        temperature=0.35,
    )
    return append_assistant_message(state, msg)


def _pick_plan_from_state(state: clientState, user_text: str) -> dict[str, Any] | None:
    """Selecciona plan from state con reglas del flujo."""
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
            label = format_vehicle_name(vehicle)
            if label:
                options.append(label)
                mapping[label] = item
    selected = canonicalize_with_typo_support(user_text, options, threshold=0.7)
    if not selected:
        return None
    return mapping.get(selected)


def _plan_significant_tokens(text: str) -> set[str]:
    """Tokens significativos para mapear name_query del extractor LLM a un plan."""
    normalized = normalize_user_text(text)
    if not normalized:
        return set()
    out: set[str] = set()
    for token in normalized.replace("'", " ").split():
        token = token.strip()
        if len(token) < 2 or token in PROMOTION_TOKEN_STOPWORDS:
            continue
        out.add(token)
    return out


def _plan_searchable_label(plan: dict[str, Any]) -> str:
    """Texto normalizado con nombre, prestamista y vehiculos del plan para matching."""
    parts = [str(plan.get("name", "")).strip(), str(plan.get("lender", "")).strip()]
    for vehicle in _available_plan_vehicles(plan):
        label = format_vehicle_name(vehicle)
        if label:
            parts.append(label)
    return normalize_user_text(" ".join(part for part in parts if part))


def _normalize_plan_name_query(text: str) -> str:
    """Normaliza fragmentos del extractor LLM (ej. 5p -> 5 puertas)."""
    normalized = normalize_user_text(text)
    if not normalized:
        return ""
    normalized = re.sub(r"\b5p\b", "5 puertas", normalized)
    normalized = re.sub(r"\b3p\b", "3 puertas", normalized)
    return normalized


def _resolve_plan_from_extract(
    candidates: list[dict[str, Any]], payload: dict[str, Any]
) -> dict[str, Any] | None:
    """Mapea salida JSON del extractor LLM a un dict de plan de financiamiento."""
    if not candidates or not isinstance(payload, dict):
        return None
    if payload.get("no_match") is True:
        return None
    raw_idx = payload.get("plan_index")
    if isinstance(raw_idx, (int, float)) and not isinstance(raw_idx, bool) and int(raw_idx) == raw_idx:
        i = int(raw_idx) - 1
        if 0 <= i < len(candidates):
            return candidates[i]
    name_q = _normalize_plan_name_query(str(payload.get("name_query") or ""))
    if not name_q:
        return None
    substring_matches: list[dict[str, Any]] = []
    for candidate in candidates:
        label = _plan_searchable_label(candidate)
        if not label:
            continue
        if name_q in label or label in name_q:
            substring_matches.append(candidate)
    if len(substring_matches) == 1:
        return substring_matches[0]
    q_tokens = _plan_significant_tokens(name_q)
    if not q_tokens:
        return None
    matches: list[dict[str, Any]] = []
    for candidate in candidates:
        label_tokens = _plan_significant_tokens(_plan_searchable_label(candidate))
        if q_tokens <= label_tokens:
            matches.append(candidate)
    if len(matches) == 1:
        return matches[0]
    return None


def _extract_plan_by_index(state: clientState, user_text: str) -> dict[str, Any] | None:
    """Extrae plan by index desde la entrada del usuario."""
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
    """Selecciona vehicle for plan con reglas del flujo."""
    candidates = state.get("financing_vehicle_candidates", [])
    if not isinstance(candidates, list) or not candidates:
        return None
    normalized = normalize_user_text(user_text)
    if normalized.isdigit():
        idx = int(normalized) - 1
        if 0 <= idx < len(candidates) and isinstance(candidates[idx], dict):
            return candidates[idx]

    options = [format_vehicle_name(item) for item in candidates if isinstance(item, dict)]
    selected = canonicalize_with_typo_support(user_text, options, threshold=0.72)
    if not selected:
        return None
    for item in candidates:
        if isinstance(item, dict) and format_vehicle_name(item) == selected:
            return item
    return None


def _pick_vehicle_from_candidates(candidates: list[dict[str, Any]], user_text: str) -> dict[str, Any] | None:
    """Selecciona un vehiculo desde una lista de candidatos."""
    if not candidates:
        return None
    normalized = normalize_user_text(user_text)
    if normalized.isdigit():
        idx = int(normalized) - 1
        if 0 <= idx < len(candidates) and isinstance(candidates[idx], dict):
            return candidates[idx]
    options = [format_vehicle_name(item) for item in candidates if isinstance(item, dict)]
    selected = canonicalize_with_typo_support(user_text, options, threshold=0.72)
    if not selected:
        return None
    for item in candidates:
        if isinstance(item, dict) and format_vehicle_name(item) == selected:
            return item
    return None


def _maybe_resolve_vehicle_from_query(user_text: str) -> dict[str, Any] | None:
    """Helper de apoyo para maybe resolve vehicle from query."""
    return resolve_single_vehicle_from_text(user_text, prefer_available=True)


def _set_selected_plan(state: clientState, plan: dict[str, Any]) -> None:
    """Actualiza selected plan en el estado de la conversacion."""
    state["selected_financing_plan_id"] = str(plan.get("id", "")).strip()
    state["selected_financing_plan_name"] = str(plan.get("name", "")).strip()
    state["selected_financing_plan_lender"] = str(plan.get("lender", "")).strip()


def _clear_incompatible_promotion(state: clientState, selected_vehicle_id: str) -> str:
    """Helper de apoyo para clear incompatible promotion."""
    promotion_id = str(state.get("selected_promotion_id", "")).strip()
    if not promotion_id:
        return ""
    promotion_vehicle_ids = state.get("selected_promotion_vehicle_ids", [])
    normalized_ids = (
        {str(item).strip() for item in promotion_vehicle_ids if str(item).strip()}
        if isinstance(promotion_vehicle_ids, list)
        else set()
    )
    if not normalized_ids or selected_vehicle_id in normalized_ids:
        return ""
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
    return generate_verified_user_message(
        mode="operational",
        verified_facts_block=(
            "evento: promocion_removida_por_incompatibilidad\n"
            f"promocion_anterior: {previous_promotion}\n"
            f"vehicle_id_seleccionado: {selected_vehicle_id}\n"
        ),
        user_message="",
        fallback=(
            f"El vehiculo elegido no aplica para {previous_promotion}, "
            "asi que quite esa promocion activa."
        ),
        temperature=0.35,
    )


def _compose_conversational_block(intro_base: str, structured_block: str, follow_up: str = "") -> str:
    """Prosa LLM anclada a datos + listado literal de vehiculos del plan."""
    listing = structured_block.strip()
    hint = "\n".join(part for part in (intro_base.strip(), follow_up.strip()) if part)
    return generate_financing_plans_user_message(
        user_text="",
        listing_block=listing,
        follow_up_hint=hint or "Indica cual vehiculo eliges para continuar.",
        fallback_semantic=hint or listing,
    )


def _compose_answer_first_block(
    *,
    user_text: str,
    context_blocks: str,
    structured_block: str,
    follow_up: str,
    fallback_semantic: str,
) -> str:
    """Listado de planes desde formatter + prosa LLM anclada (sin duplicar listado en la prosa)."""

    _ = context_blocks  # reservado por compatibilidad de firma con llamadas existentes
    listing = structured_block.strip()
    return generate_financing_plans_user_message(
        user_text=user_text,
        listing_block=listing,
        follow_up_hint=follow_up,
        fallback_semantic=fallback_semantic,
    )


def _route_to_car_selection_for_vehicle_detail(
    state: clientState,
    *,
    vehicle_id: str,
    vehicle_name: str,
    reason: str,
    plan_name: str = "",
) -> clientState:
    """Delega el detalle del vehiculo a car_selection en el mismo turno."""
    state["selected_vehicle_id"] = vehicle_id
    state["selected_car"] = vehicle_name
    state["awaiting_purchase_confirmation"] = False
    state["last_vehicle_candidates"] = []
    state["intent"] = "vehicle_catalog"
    state["current_node"] = "car_selection"
    state["show_selected_vehicle_detail_once"] = True
    reset_vehicle_images_state(state)
    _debug(
        "plan_vehicle_info_requested",
        plan_name=plan_name,
        selected_vehicle_id=vehicle_id,
        selected_car=vehicle_name,
    )
    _debug("route_change", next_node="car_selection", reason=reason)
    return state


def _pick_plan_for_vehicle_info(state: clientState, user_text: str) -> dict[str, Any] | None:
    """Selecciona plan for vehicle info con reglas del flujo."""
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
            if normalize_user_text(format_vehicle_name(vehicle)) in normalized_user:
                matching.append(item)
                break
    if len(matching) == 1:
        return matching[0]
    return None


def _available_plan_vehicles(plan: dict[str, Any]) -> list[dict[str, Any]]:
    """Helper de apoyo para available plan vehicles."""
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
    """Filtra plans with available vehicles segun criterios de negocio."""
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
    if state.get("suppress_commercial_node_once"):
        state["suppress_commercial_node_once"] = False
        _debug("suppress_commercial_node_once", action="skip_node_execution")
        return state

    user_text = latest_user_message(state)
    selected_vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
    selected_car = str(state.get("selected_car", "")).strip()
    plan_candidates_raw = state.get("financing_plan_candidates", [])
    dict_plan_candidates = (
        [p for p in plan_candidates_raw if isinstance(p, dict)]
        if isinstance(plan_candidates_raw, list)
        else []
    )
    numbered_plan_lines = _numbered_financing_plan_lines(dict_plan_candidates) if dict_plan_candidates else ""

    step_flags = classify_financing_step_flags(
        previous_bot_message=str(state.get("last_bot_message", "")).strip(),
        user_message=user_text,
        selected_vehicle_name=selected_car,
        has_selected_vehicle=bool(selected_vehicle_id),
        has_selected_promotion=bool(str(state.get("selected_promotion_id", "")).strip()),
        awaiting_plan_selection=bool(state.get("awaiting_financing_plan_selection")),
        awaiting_vehicle_selection=bool(state.get("awaiting_financing_vehicle_selection")),
        numbered_plan_lines=numbered_plan_lines,
    )
    _debug("step_flags", **step_flags)
    _debug(
        "entry",
        user_text=user_text,
        awaiting_financing_plan_selection=bool(state.get("awaiting_financing_plan_selection")),
        awaiting_financing_vehicle_selection=bool(state.get("awaiting_financing_vehicle_selection")),
        selected_vehicle_id=selected_vehicle_id,
        selected_car=selected_car,
    )

    # Si el usuario hace una nueva consulta de financiamiento por vehiculo
    # mientras esperabamos seleccion de plan, reiniciamos ese tramo del flujo
    # para evitar seleccionar un plan previo de forma implicita.
    refreshed_vehicle_hint = _maybe_resolve_vehicle_from_query(user_text)
    if (
        state.get("awaiting_financing_plan_selection")
        and refreshed_vehicle_hint
        and step_flags.get("ask_financing_with_vehicle")
    ):
        refreshed_vehicle_id = str(refreshed_vehicle_hint.get("id", "")).strip()
        refreshed_car = format_vehicle_name(refreshed_vehicle_hint)
        state["awaiting_financing_plan_selection"] = False
        state["selected_financing_plan_id"] = ""
        state["selected_financing_plan_name"] = ""
        state["selected_financing_plan_lender"] = ""
        state["financing_plan_candidates"] = []
        state["selected_vehicle_id"] = refreshed_vehicle_id
        state["selected_car"] = refreshed_car
        selected_vehicle_id = refreshed_vehicle_id
        selected_car = refreshed_car
        _debug(
            "financing_query_vehicle_refresh",
            selected_vehicle_id=refreshed_vehicle_id,
            selected_car=refreshed_car,
        )

    # Permite salir de financiamiento hacia promociones cuando el usuario cambia de tema.
    if state.get("pending_financing_after_promotion"):
        state["pending_financing_after_promotion"] = False
        _debug("promotion_chain_resume", action="skip_promotions_redirect")
    elif step_flags.get("ask_promotions") and not step_flags.get("ask_financing_with_vehicle"):
        state["awaiting_financing_plan_selection"] = False
        state["awaiting_financing_vehicle_selection"] = False
        state["financing_plan_candidates"] = []
        state["financing_vehicle_candidates"] = []
        state["current_node"] = "promotions"
        state["intent"] = "promotions"
        _debug("route_change", next_node="promotions", reason="promotions_requested")
        return state

    if step_flags.get("ask_other_vehicles"):
        state["awaiting_financing_plan_selection"] = False
        state["awaiting_financing_vehicle_selection"] = False
        state["financing_plan_candidates"] = []
        state["financing_vehicle_candidates"] = []
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        _debug("route_change", next_node="car_selection", reason="catalog_requested")
        return state

    # Enganche generico: solo FAQ publicada, sin listar planes ni catalogo global.
    if is_generic_down_payment_only_question(user_text) and resolve_down_payment_message(user_text):
        _debug("generic_down_payment_faq_only", user_text=user_text)
        return append_down_payment_faq_if_applicable(state, user_text)

    if state.get("awaiting_financing_vehicle_selection"):
        selected_vehicle = _pick_vehicle_for_plan(state, user_text)
        if not selected_vehicle:
            _debug("awaiting_vehicle_selection_invalid_choice", user_text=user_text)
            reminder = generate_verified_user_message(
                mode="operational",
                verified_facts_block=(
                    "situacion: esperando_seleccion_vehiculo_en_plan\n"
                    f"ultimo_mensaje_usuario: {user_text}\n"
                    f"candidatos_vehiculos_en_plan: {json.dumps([format_vehicle_name(v) for v in state.get('financing_vehicle_candidates', []) if isinstance(v, dict)], ensure_ascii=False)}\n"
                ),
                user_message=user_text,
                fallback="Necesito que selecciones uno de los vehiculos del plan. Puedes responder con nombre o numero.",
                temperature=0.35,
            )
            return append_assistant_message(state, reminder)

        selected_vehicle_id = str(selected_vehicle.get("id", "")).strip()
        selected_car = format_vehicle_name(selected_vehicle)
        state["selected_vehicle_id"] = selected_vehicle_id
        state["selected_car"] = selected_car
        state["awaiting_financing_vehicle_selection"] = False
        state["financing_vehicle_candidates"] = []
        state["awaiting_purchase_confirmation"] = False
        state["last_vehicle_candidates"] = []
        state["intent"] = "lead_capture"
        state["current_node"] = "lead_capture"
        promotion_notice = _clear_incompatible_promotion(state, selected_vehicle_id)
        _debug(
            "route_change",
            next_node="lead_capture",
            selected_vehicle_id=selected_vehicle_id,
            selected_car=selected_car,
            selected_plan=state.get("selected_financing_plan_name", ""),
        )
        confirmation = generate_verified_user_message(
            mode="operational",
            verified_facts_block=(
                "evento: confirmacion_tras_elegir_vehiculo_en_plan\n"
                f"vehicle_id: {selected_vehicle_id}\n"
                f"vehicle_etiqueta: {selected_car}\n"
                f"plan_nombre: {state.get('selected_financing_plan_name', '')}\n"
            ),
            user_message=user_text,
            fallback=(
                f"Perfecto, entonces avanzamos con {selected_car} y el plan "
                f"{state.get('selected_financing_plan_name', 'seleccionado')}."
            ),
            temperature=0.35,
        )
        if promotion_notice:
            confirmation = f"{promotion_notice}\n\n{confirmation}"
        return append_assistant_message(state, confirmation)

    if state.get("awaiting_financing_plan_selection"):
        candidates = state.get("financing_plan_candidates", [])
        dict_candidates = dict_plan_candidates

        if step_flags.get("wants_compare_two_plans"):
            compared = _try_compare_financing_plans_reply(state, user_text, candidates)
            if compared is not None:
                return compared

        if step_flags.get("reject_financing_keep_purchase") and selected_car:
            state["awaiting_financing_plan_selection"] = False
            state["selected_financing_plan_id"] = ""
            state["selected_financing_plan_name"] = ""
            state["selected_financing_plan_lender"] = ""
            state["financing_plan_candidates"] = []
            state["awaiting_purchase_confirmation"] = False
            state["intent"] = "lead_capture"
            state["current_node"] = "lead_capture"
            _debug(
                "route_change",
                next_node="lead_capture",
                reason="reject_financing_keep_purchase",
                selected_vehicle_id=selected_vehicle_id,
                selected_car=selected_car,
            )
            confirmation = generate_verified_user_message(
                mode="operational",
                verified_facts_block=(
                    "evento: rechazo_planes_con_intencion_de_compra\n"
                    f"vehicle_id: {selected_vehicle_id}\n"
                    f"vehicle_etiqueta: {selected_car}\n"
                    "accion: continuar_a_captura_de_lead_sin_plan\n"
                ),
                user_message=user_text,
                fallback=(
                    f"Perfecto, continuamos con la compra de {selected_car} sin plan de financiamiento. "
                    "Compárteme tu nombre completo para avanzar."
                ),
                temperature=0.35,
            )
            return append_assistant_message(state, confirmation)

        selected_plan: dict[str, Any] | None = None
        selection_intent = bool(step_flags.get("select_plan"))

        if selection_intent and numbered_plan_lines.strip() and dict_candidates:
            payload = extract_financing_plan_selection_payload(
                previous_bot_message=str(state.get("last_bot_message", "")).strip(),
                user_message=user_text,
                numbered_plan_lines=numbered_plan_lines,
            )
            extracted = _resolve_plan_from_extract(dict_candidates, payload)
            if extracted:
                selected_plan = extracted
                _debug(
                    "plan_pick",
                    source="llm_extract",
                    name=str(extracted.get("name", "")).strip(),
                    payload=payload,
                )

        if not selected_plan and (
            isinstance(candidates, list)
            and len(candidates) == 1
            and isinstance(candidates[0], dict)
        ):
            unique_plan = candidates[0]
            plan_name = str(unique_plan.get("name", "")).strip()
            selection_intent_llm = classify_financing_plan_selection_intent(
                previous_bot_message=str(state.get("last_bot_message", "")).strip(),
                user_message=user_text,
                plan_count=1,
                single_plan_name=plan_name,
            )
            _debug(
                "single_plan_selection_intent",
                intent=selection_intent_llm,
                user_text=user_text,
                plan_name=plan_name,
            )
            if selection_intent_llm == "SELECT_SINGLE_PLAN":
                selected_plan = unique_plan

        if not selected_plan and step_flags.get("ask_plan_vehicle_info"):
            plan_for_info = None
            if numbered_plan_lines.strip() and dict_candidates:
                payload = extract_financing_plan_selection_payload(
                    previous_bot_message=str(state.get("last_bot_message", "")).strip(),
                    user_message=user_text,
                    numbered_plan_lines=numbered_plan_lines,
                )
                plan_for_info = _resolve_plan_from_extract(dict_candidates, payload)
            if not plan_for_info:
                plan_for_info = _pick_plan_for_vehicle_info(state, user_text)

            target_vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
            target_vehicle_name = str(state.get("selected_car", "")).strip()
            plan_name = str(plan_for_info.get("name", "")).strip() if plan_for_info else ""

            if plan_for_info:
                plan_vehicles = _available_plan_vehicles(plan_for_info)
                if not plan_vehicles:
                    message = generate_verified_user_message(
                        mode="operational",
                        verified_facts_block=(
                            f"plan_nombre: {plan_name or 'este plan'}\n"
                            "vehiculos_disponibles_en_plan: 0\n"
                        ),
                        user_message=user_text,
                        fallback=(
                            f"El plan {plan_name or 'este plan'} no tiene vehiculos disponibles vinculados. "
                            "Si quieres, te muestro otros planes."
                        ),
                        temperature=0.35,
                    )
                    return append_assistant_message(state, message)
                target_vehicle = plan_vehicles[0]
                target_vehicle_id = str(target_vehicle.get("id", "")).strip()
                target_vehicle_name = format_vehicle_name(target_vehicle)

            if target_vehicle_id:
                return _route_to_car_selection_for_vehicle_detail(
                    state,
                    vehicle_id=target_vehicle_id,
                    vehicle_name=target_vehicle_name,
                    reason="plan_vehicle_info_requested",
                    plan_name=plan_name,
                )

        if not selected_plan:
            selected_plan = _pick_plan_from_state(state, user_text)
            if selected_plan:
                _debug(
                    "plan_pick",
                    source="heuristic_fallback",
                    name=str(selected_plan.get("name", "")).strip(),
                )

        if not selected_plan:
            _debug("awaiting_plan_selection_invalid_choice", user_text=user_text)
            reminder = generate_verified_user_message(
                mode="operational",
                verified_facts_block=(
                    "situacion: esperando_seleccion_de_plan\n"
                    f"ultimo_mensaje_usuario: {user_text}\n"
                    f"planes_candidatos_ids: {json.dumps([str(p.get('id','')) for p in candidates if isinstance(p, dict)])}\n"
                ),
                user_message=user_text,
                fallback="Dime cual plan te interesa (por nombre o numero) para continuar.",
                temperature=0.35,
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
            digit_was_plan_choice = _digit_message_selects_financing_plan(state, user_text, selected_plan)
            requested_vehicle = (
                None
                if digit_was_plan_choice
                else _pick_vehicle_from_candidates(plan_vehicles, user_text)
            )
            if not requested_vehicle:
                requested_vehicle = _maybe_resolve_vehicle_from_query(user_text)
                if requested_vehicle:
                    requested_vehicle_id = str(requested_vehicle.get("id", "")).strip()
                    if requested_vehicle_id:
                        allowed_ids = {
                            str(item.get("id", "")).strip()
                            for item in plan_vehicles
                            if isinstance(item, dict) and str(item.get("id", "")).strip()
                        }
                        if requested_vehicle_id not in allowed_ids:
                            requested_vehicle = None
            if requested_vehicle:
                selected_vehicle_id = str(requested_vehicle.get("id", "")).strip()
                selected_car = format_vehicle_name(requested_vehicle)
                state["selected_vehicle_id"] = selected_vehicle_id
                state["selected_car"] = selected_car
                state["awaiting_financing_vehicle_selection"] = False
                state["financing_vehicle_candidates"] = []
                state["awaiting_purchase_confirmation"] = False
                state["last_vehicle_candidates"] = []
                state["intent"] = "vehicle_catalog"
                state["current_node"] = "car_selection"
                state["show_selected_vehicle_detail_once"] = True
                _clear_incompatible_promotion(state, selected_vehicle_id)
                _debug(
                    "plan_and_vehicle_selected_in_same_turn",
                    plan_name=state.get("selected_financing_plan_name", ""),
                    selected_vehicle_id=selected_vehicle_id,
                    selected_car=selected_car,
                )
                _debug(
                    "route_change",
                    next_node="car_selection",
                    reason="selected_plan_and_requested_vehicle",
                )
                return state
            if len(plan_vehicles) == 1:
                only_vehicle = plan_vehicles[0]
                selected_vehicle_id = str(only_vehicle.get("id", "")).strip()
                selected_car = format_vehicle_name(only_vehicle)
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
                    promotion_notice = _clear_incompatible_promotion(state, selected_vehicle_id)
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
                    confirmation = generate_verified_user_message(
                        mode="operational",
                        verified_facts_block=(
                            "evento: plan_unico_mismo_vehiculo_preseleccionado\n"
                            f"vehicle_id: {selected_vehicle_id}\n"
                            f"vehicle_etiqueta: {selected_car}\n"
                            f"plan_nombre: {state.get('selected_financing_plan_name', '')}\n"
                        ),
                        user_message=user_text,
                        fallback=(
                            f"Perfecto, entonces avanzamos con {selected_car} y el plan "
                            f"{state.get('selected_financing_plan_name', 'seleccionado')}."
                        ),
                        temperature=0.35,
                    )
                    if promotion_notice:
                        confirmation = f"{promotion_notice}\n\n{confirmation}"
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
                _clear_incompatible_promotion(state, selected_vehicle_id)
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
            question = _compose_conversational_block(
                "Perfecto, te muestro los vehiculos disponibles dentro de este plan para que elijas el que prefieras.",
                vehicle_picker,
                "Cuando lo elijas, paso a capturar tus datos para darte seguimiento.",
            )
            return append_assistant_message(state, question)

        _debug("selected_plan_without_vehicles")
        fallback = generate_verified_user_message(
            mode="operational",
            verified_facts_block=(
                "situacion: plan_sin_vehiculos_vinculados\n"
                f"plan_nombre: {state.get('selected_financing_plan_name', '')}\n"
                f"plan_id: {state.get('selected_financing_plan_id', '')}\n"
            ),
            user_message=user_text,
            fallback="Este plan no trae vehiculos vinculados. Dime marca y modelo del carro que te interesa para continuar.",
            temperature=0.35,
        )
        return append_assistant_message(state, fallback)

    selected_vehicle_id = str(state.get("selected_vehicle_id", "")).strip()
    selected_car = str(state.get("selected_car", "")).strip()

    vehicle_hint = _maybe_resolve_vehicle_from_query(user_text)
    if vehicle_hint and not selected_vehicle_id:
        selected_vehicle_id = str(vehicle_hint.get("id", "")).strip()
        selected_car = format_vehicle_name(vehicle_hint)
        state["selected_vehicle_id"] = selected_vehicle_id
        state["selected_car"] = selected_car
        _debug("vehicle_hint_resolved", selected_vehicle_id=selected_vehicle_id, selected_car=selected_car)

    if selected_vehicle_id and (step_flags.get("ask_financing_with_vehicle") or selected_car):
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
            promo_title = str(state.get("selected_promotion_title", "")).strip()
            promo_line = f"Promocion aplicada: {promo_title}\n" if promo_title else ""
            question = _compose_answer_first_block(
                user_text=user_text,
                context_blocks=(
                    f"{promo_line}"
                    f"Vehiculo consultado: {selected_car or 'este vehiculo'}\n\n"
                    f"Planes disponibles:\n{message}"
                ),
                structured_block=message,
                follow_up=follow_up,
                fallback_semantic=f"Claro, para {selected_car or 'este vehiculo'} si tenemos opciones de pago a plazos.",
            )
            return _return_plan_listing(state, question, user_text)

        # Vehículo seleccionado sin planes vinculados: no caer al catálogo global.
        _debug(
            "plans_for_vehicle_empty",
            selected_vehicle_id=selected_vehicle_id,
            selected_car=selected_car,
        )
        asked_for_plans = bool(
            step_flags.get("ask_financing_with_vehicle") or step_flags.get("ask_explicit_plan")
        )
        if asked_for_plans:
            message = generate_verified_user_message(
                mode="operational",
                verified_facts_block=(
                    "operacion: fetch_financing_plans_by_vehicle\n"
                    "resultado: lista_vacia\n"
                    f"vehicle_id: {selected_vehicle_id}\n"
                    f"vehicle_etiqueta: {selected_car or 'este vehiculo'}\n"
                ),
                user_message=user_text,
                fallback=(
                    f"Por ahora {selected_car or 'este vehiculo'} no tiene planes de "
                    "financiamiento asignados. Te invitamos a visitarnos en nuestra sucursal para que te ayudemos con tu consulta."
                ),
                temperature=0.35,
            )
            return append_assistant_message(state, message)
        return append_down_payment_faq_if_applicable(state, user_text)

    try:
        plans = fetch_financing_plans()
    except Exception:
        _debug("plans_fetch_error")
        plans = []
    plans = _filter_plans_with_available_vehicles(plans)

    if not plans:
        _debug("plans_unavailable")
        message = generate_verified_user_message(
            mode="operational",
            verified_facts_block=(
                "operacion: fetch_financing_plans\n"
                "resultado: lista_vacia_despues_de_filtros\n"
            ),
            user_message=user_text,
            fallback=(
                "No hay planes de financiamiento con vehiculos disponibles en este momento. "
                "Si quieres, podemos coordinar seguimiento para revisar opciones."
            ),
            temperature=0.35,
        )
        state = append_assistant_message(state, message)
        return append_down_payment_faq_if_applicable(state, user_text)

    state["financing_plan_candidates"] = plans
    state["awaiting_financing_plan_selection"] = True
    _debug("plans_loaded", total_plans=len(plans))
    platform = str(state.get("platform", "web")).strip().lower() or "web"
    listing = format_financing_plans(plans, platform=platform)
    prompt = _compose_answer_first_block(
        user_text=user_text,
        context_blocks=f"Planes de financiamiento vigentes:\n{listing}",
        structured_block=listing,
        follow_up="Si te interesa uno en particular, dime el nombre o numero del plan. Despues te pedire seleccionar el vehiculo dentro de ese plan.",
        fallback_semantic="Claro, manejamos pagos a plazos y puedo mostrarte los planes disponibles.",
    )
    return _return_plan_listing(state, prompt, user_text)
