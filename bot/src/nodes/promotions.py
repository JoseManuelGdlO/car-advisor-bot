"""Nodo de promociones: listar, validar aplicacion explicita y confirmar interes."""

from __future__ import annotations

from typing import Any

from src.services.car_selection_fallback import user_asks_for_color, user_asks_for_dimensions
from src.services.llm_responses import (
    classify_promotion_comparison_payload,
    classify_promotions_step_flags,
    classify_promotion_selection_intent,
    extract_promotion_selection_payload,
    generate_promotion_listing_user_message,
    generate_verified_user_message,
)
from src.state import clientState
from src.tools.database import fetch_promotions, fetch_promotions_by_vehicle
from src.tools.vehicles import (
    canonicalize_with_typo_support,
    fetch_vehicle_by_id,
    normalize_user_text,
)
from src.utils.formatters import format_promotion_comparison, format_promotions, format_vehicle_detail, format_vehicle_name
from src.utils.signals import (
    AFFIRMATIVE_SIGNALS,
    EXPLICIT_PROMOTION_APPLY_SIGNALS,
    NEGATIVE_SIGNALS,
    PROMOTION_TOKEN_STOPWORDS,
    VEHICLE_INFO_REQUEST_SIGNALS,
)
from src.utils.app_logging import get_app_logger, log_flow_trace
from src.utils.state_helpers import append_assistant_message, latest_user_message

_PROMO_VEHICLE_LABEL_MISSING = "[no disponible]"

_log = get_app_logger("promotions")


def _debug(event: str, **payload: Any) -> None:
    """Trazas de depuracion; payload completo solo con LOG_LEVEL=debug."""

    log_flow_trace(_log, "promotions", event, **payload)


def _is_vehicle_info_request(user_text: str) -> bool:
    """Retorna True cuando is vehicle info request."""
    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return any(signal in normalized for signal in VEHICLE_INFO_REQUEST_SIGNALS)


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


def _numbered_promotion_lines(promotions: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for idx, p in enumerate(promotions, start=1):
        title = str(p.get("title", "")).strip()
        if title:
            lines.append(f"{idx}. {title}")
    return "\n".join(lines)


def _resolve_two_promotions_for_compare(
    promotions: list[dict[str, Any]], payload: dict[str, Any]
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    il_raw, ir_raw = payload.get("index_left"), payload.get("index_right")
    il: int | None
    ir: int | None
    if isinstance(il_raw, (int, float)) and not isinstance(il_raw, bool) and int(il_raw) == il_raw:
        il = int(il_raw)
    else:
        il = None
    if isinstance(ir_raw, (int, float)) and not isinstance(ir_raw, bool) and int(ir_raw) == ir_raw:
        ir = int(ir_raw)
    else:
        ir = None
    if isinstance(il, int) and isinstance(ir, int):
        i, j = il - 1, ir - 1
        if 0 <= i < len(promotions) and 0 <= j < len(promotions) and i != j:
            return promotions[i], promotions[j]
    tl = str(payload.get("title_left") or "").strip().lower()
    tr = str(payload.get("title_right") or "").strip().lower()
    if not tl or not tr:
        return None, None

    def _match(fragment: str) -> dict[str, Any] | None:
        for p in promotions:
            title = str(p.get("title", "")).strip().lower()
            if fragment in title or title in fragment:
                return p
        return None

    a = _match(tl)
    b = _match(tr)
    if a and b:
        ida, idb = str(a.get("id", "")).strip(), str(b.get("id", "")).strip()
        if ida and idb and ida == idb:
            return None, None
        tta = str(a.get("title", "")).strip()
        ttb = str(b.get("title", "")).strip()
        if tta and tta == ttb:
            return None, None
        return a, b
    return None, None


def _try_answer_promotion_comparison(
    state: clientState, user_text: str, candidates: list[dict[str, Any]]
) -> clientState | None:
    if len(candidates) < 2:
        return None
    lines = _numbered_promotion_lines(candidates)
    if not lines.strip():
        return None
    payload = classify_promotion_comparison_payload(
        previous_bot_message=str(state.get("last_bot_message", "")).strip(),
        user_message=user_text,
        numbered_promotion_lines=lines,
    )
    if not payload.get("wants_compare"):
        return None
    a, b = _resolve_two_promotions_for_compare(candidates, payload)
    if not a or not b:
        return None
    platform = str(state.get("platform", "web")).strip().lower() or "web"
    table = format_promotion_comparison(a, b, platform=platform)
    verified = "\n".join(
        [
            "operacion: comparacion_promociones",
            f"promo_a: {str(a.get('title', '')).strip()}",
            f"promo_b: {str(b.get('title', '')).strip()}",
            "",
            "TABLA_COMPARACION_LITERAL:",
            table,
            "",
            "cierre_literal: Si quieres aplicar una, dimelo por nombre y confirma explicitamente.",
        ]
    )
    msg = generate_verified_user_message(
        mode="operational",
        verified_facts_block=verified,
        user_message=user_text,
        fallback=f"{table}\n\nSi quieres aplicar una, dimelo por nombre y confirma explicitamente.",
        temperature=0.35,
    )
    return append_assistant_message(state, msg)


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


def _pick_vehicle_from_list_by_text(vehicles: list[Any], user_text: str) -> dict[str, Any] | None:
    """Elige vehículo por número o nombre dentro de una lista ya cargada (sin catálogo GET /vehicles)."""
    valid = [item for item in vehicles if isinstance(item, dict)]
    if not valid:
        return None
    by_index = _extract_by_index(valid, user_text)
    if by_index is not None:
        return by_index
    labels = [format_vehicle_name(item) for item in valid]
    selected = canonicalize_with_typo_support(user_text, labels, threshold=0.72)
    if not selected:
        return None
    for item in valid:
        if format_vehicle_name(item) == selected:
            return item
    return None


def _significant_tokens(text: str) -> set[str]:
    """Tokens del texto normalizado, sin ruido corto, para solapamiento titulo/usuario."""
    normalized = normalize_user_text(text)
    if not normalized:
        return set()
    out: set[str] = set()
    for token in normalized.replace("'", " ").split():
        token = token.strip()
        if len(token) < 3 or token in PROMOTION_TOKEN_STOPWORDS:
            continue
        out.add(token)
    return out


def _pick_promotion_by_token_overlap(dict_candidates: list[dict[str, Any]], user_text: str) -> dict[str, Any] | None:
    """Elige una promo cuando el usuario nombra solo parte del titulo (ej. mensualidad gratis vs titulo largo)."""
    user_tokens = _significant_tokens(user_text)
    if not user_tokens:
        return None
    scored: list[tuple[float, dict[str, Any]]] = []
    for item in dict_candidates:
        title = str(item.get("title", "")).strip()
        if not title:
            continue
        title_tokens = _significant_tokens(title)
        if not title_tokens:
            continue
        inter = user_tokens & title_tokens
        if not inter:
            continue
        recall = len(inter) / max(1, len(title_tokens))
        precision = len(inter) / max(1, len(user_tokens))
        score = 0.62 * recall + 0.38 * precision
        scored.append((score, item))
    if not scored:
        return None
    max_score = max(s for s, _ in scored)
    if max_score < 0.28:
        return None
    winners = [it for s, it in scored if abs(s - max_score) < 1e-9]
    if len(winners) != 1:
        return None
    return winners[0]


def _resolve_promotion_from_extract(
    candidates: list[dict[str, Any]], payload: dict[str, Any]
) -> dict[str, Any] | None:
    """Mapea salida JSON del extractor LLM a un dict de promocion."""
    if not candidates or not isinstance(payload, dict):
        return None
    if payload.get("no_match") is True:
        return None
    raw_idx = payload.get("promotion_index")
    if isinstance(raw_idx, (int, float)) and not isinstance(raw_idx, bool) and int(raw_idx) == raw_idx:
        i = int(raw_idx) - 1
        if 0 <= i < len(candidates):
            return candidates[i]
    title_q = normalize_user_text(str(payload.get("title_query") or ""))
    if not title_q:
        return None
    for candidate in candidates:
        title = normalize_user_text(str(candidate.get("title", "")))
        if not title:
            continue
        if title_q in title or title in title_q:
            return candidate
    q_tokens = _significant_tokens(title_q)
    if not q_tokens:
        return None
    matches = []
    for candidate in candidates:
        t_tokens = _significant_tokens(str(candidate.get("title", "")))
        if q_tokens <= t_tokens:
            matches.append(candidate)
    if len(matches) == 1:
        return matches[0]
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

    # Primero intentamos una coincidencia tolerante a typos basados en todo el texto del usuario.
    selected = canonicalize_with_typo_support(user_text, options, threshold=0.7)

    # Si el clasificador difuso no encuentra nada, intentamos un match mas directo por subcadenas
    # para casos como "me interesa mensualidad gratis" vs "Mensualidad gratis en SUVs".
    if not selected:
        normalized_user = normalize_user_text(user_text)
        for option in options:
            normalized_option = normalize_user_text(option)
            if not normalized_option or not normalized_user:
                continue
            if normalized_option in normalized_user or normalized_user in normalized_option:
                selected = option
                break

    if not selected:
        overlap = _pick_promotion_by_token_overlap(dict_candidates, user_text)
        if overlap:
            return overlap

    if not selected:
        return None
    return mapping.get(selected)


def _looks_like_explicit_apply(user_text: str) -> bool:
    """Detecta si el texto parece explicit apply."""
    normalized = normalize_user_text(user_text)
    return any(signal in normalized for signal in EXPLICIT_PROMOTION_APPLY_SIGNALS)


def _pick_vehicle_candidate(state: clientState, user_text: str) -> dict[str, Any] | None:
    """Selecciona vehicle candidate con reglas del flujo."""
    candidates = state.get("promotion_vehicle_candidates", [])
    if not isinstance(candidates, list):
        return None
    return _pick_vehicle_from_list_by_text(candidates, user_text)


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


def _find_preselected_in_promotion_vehicles(
    state: clientState,
    promotion_vehicles: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Devuelve el vehiculo preseleccionado si pertenece a la lista de la promocion."""
    preselected_id = str(state.get("selected_vehicle_id", "")).strip()
    if not preselected_id:
        return None
    for vehicle in promotion_vehicles:
        if isinstance(vehicle, dict) and str(vehicle.get("id", "")).strip() == preselected_id:
            return vehicle
    return None


def _try_apply_promotion_to_preselected_vehicle(
    state: clientState,
    selected_promotion: dict[str, Any],
    *,
    chain_financing: bool,
) -> clientState | None:
    """Aplica la promo al vehiculo ya en contexto; opcionalmente encadena a financing."""
    preselected_id = str(state.get("selected_vehicle_id", "")).strip()
    if not preselected_id:
        return None

    promotion_vehicles = _load_promotion_vehicles(state, selected_promotion)
    allowed_ids = {
        str(vehicle.get("id", "")).strip()
        for vehicle in promotion_vehicles
        if isinstance(vehicle, dict) and str(vehicle.get("id", "")).strip()
    }
    if preselected_id not in allowed_ids:
        return None

    matching = next(
        (
            vehicle
            for vehicle in promotion_vehicles
            if isinstance(vehicle, dict) and str(vehicle.get("id", "")).strip() == preselected_id
        ),
        None,
    )
    if not isinstance(matching, dict):
        return None

    state["selected_vehicle_id"] = preselected_id
    state["selected_car"] = format_vehicle_name(matching)
    state["awaiting_promotion_selection"] = False
    state["awaiting_promotion_apply_confirmation"] = False
    state["awaiting_promotion_vehicle_selection"] = False
    state["awaiting_promotion_vehicle_interest_confirmation"] = False
    state["promotion_vehicle_candidates"] = []

    if not chain_financing:
        state["current_node"] = "lead_capture"
        state["intent"] = "lead_capture"
        _debug(
            "route_change",
            next_node="lead_capture",
            reason="promotion_applied_preselected_vehicle",
            selected_vehicle_id=preselected_id,
            promotion_title=str(state.get("selected_promotion_title", "")).strip(),
        )
        return append_assistant_message(
            state,
            generate_verified_user_message(
                mode="operational",
                verified_facts_block=(
                    "evento: promocion_aplicada_a_vehiculo_preseleccionado\n"
                    f"vehicle_id: {preselected_id}\n"
                    f"vehicle_etiqueta: {state.get('selected_car', '')}\n"
                    f"promocion_titulo: {str(state.get('selected_promotion_title', '')).strip()}\n"
                ),
                user_message=latest_user_message(state),
                fallback="Perfecto, avancemos con tus datos para aplicar la promocion a este vehiculo.",
                temperature=0.35,
            ),
        )

    state["pending_financing_after_promotion"] = True
    state["current_node"] = "financing"
    state["intent"] = "financing"
    _debug(
        "route_change",
        next_node="financing",
        reason="promotion_applied_chain_financing",
        selected_vehicle_id=preselected_id,
        promotion_title=str(state.get("selected_promotion_title", "")).strip(),
    )
    return state


def _show_vehicle_and_confirm_interest(state: clientState, vehicle: dict[str, Any]) -> clientState:
    """Helper de apoyo para show vehicle and confirm interest."""
    vehicle_id = str(vehicle.get("id", "")).strip()
    state["selected_vehicle_id"] = vehicle_id
    state["selected_car"] = format_vehicle_name(vehicle)
    state["awaiting_promotion_vehicle_interest_confirmation"] = True
    state["awaiting_promotion_vehicle_selection"] = False
    user_text = latest_user_message(state)
    detail = format_vehicle_detail(
        vehicle,
        platform=str(state.get("platform", "web")),
        include_color=user_asks_for_color(user_text),
        include_dimensions=user_asks_for_dimensions(user_text),
    )
    promotion_title = str(state.get("selected_promotion_title", "")).strip() or "esta promocion"
    promo_id = str(state.get("selected_promotion_id", "")).strip()
    verified = "\n".join(
        [
            f"promocion_titulo: {promotion_title}",
            f"promocion_id: {promo_id}",
            f"vehicle_id: {vehicle_id}",
            "",
            "FICHA_VEHICULO_INVENTARIO:",
            detail,
        ]
    )
    message = generate_verified_user_message(
        mode="promotion_vehicle_confirm",
        verified_facts_block=verified,
        user_message=latest_user_message(state),
        fallback=(
            f"Este es el vehiculo aplicable a {promotion_title}. "
            "Te interesa este vehiculo con la promocion? Si me confirmas, avanzamos con tus datos."
        ),
        temperature=0.42,
    )
    return append_assistant_message(state, message)


def _promotion_vehicle_labels(promotion: dict[str, Any]) -> list[str]:
    """Etiquetas aplicables solo desde vehicleLabels del API (sin GET por vehículo)."""
    raw_labels_any = promotion.get("vehicleLabels")
    if not isinstance(raw_labels_any, list):
        return []
    return [str(raw).strip() for raw in raw_labels_any if str(raw).strip()]


def _hydrate_promotions_with_vehicle_labels(promotions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Helper de apoyo para hydrate promotions with vehicle labels."""
    hydrated: list[dict[str, Any]] = []
    missing_norm = _PROMO_VEHICLE_LABEL_MISSING.strip().lower()
    for item in promotions:
        if not isinstance(item, dict):
            continue
        if not bool(item.get("active", True)):
            continue
        row = dict(item)
        vehicle_labels = _promotion_vehicle_labels(item)
        usable = [
            str(lbl).strip()
            for lbl in vehicle_labels
            if str(lbl).strip() and str(lbl).strip().lower() != missing_norm
        ]
        if not usable:
            continue
        row["vehicleLabels"] = usable
        hydrated.append(row)
    return hydrated


def _respond_promotion_listing(state: clientState, promotions: list[dict[str, Any]]) -> clientState:
    """Genera una respuesta para promotion listing."""
    platform = str(state.get("platform", "web")).strip().lower() or "web"
    hydrated_promotions = _hydrate_promotions_with_vehicle_labels(promotions)
    if not hydrated_promotions:
        state["promotion_candidates"] = []
        state["awaiting_promotion_selection"] = False
        state["awaiting_promotion_apply_confirmation"] = False
        empty_msg = generate_verified_user_message(
            mode="operational",
            verified_facts_block=(
                "operacion: listar_promociones_hidratadas\n"
                "resultado: lista_vacia_tras_hidratar\n"
            ),
            user_message=latest_user_message(state),
            fallback="No hay promociones disponibles para aplicar en este momento.",
            temperature=0.35,
        )
        return append_assistant_message(state, empty_msg)
    listing = format_promotions(hydrated_promotions, platform=platform)
    prompt = generate_promotion_listing_user_message(
        user_text=latest_user_message(state),
        listing_block=listing,
        closing_hint="Si quieres aplicar una, dime cual y confirmame explicitamente que deseas aplicarla.",
        fallback_semantic="Claro, te comparto las promociones activas para que revises cual te conviene mas.",
    )
    state["promotion_candidates"] = hydrated_promotions
    state["awaiting_promotion_selection"] = True
    state["awaiting_promotion_apply_confirmation"] = False
    return append_assistant_message(state, prompt)


def promotions(state: clientState) -> clientState:
    """Gestiona promociones generales o por vehiculo, y confirma interes antes de lead_capture."""

    state["current_node"] = "promotions"
    if state.get("suppress_commercial_node_once"):
        state["suppress_commercial_node_once"] = False
        _debug("suppress_commercial_node_once", action="skip_node_execution")
        return state
    user_text = latest_user_message(state)
    _debug(
        "entry",
        user_text=user_text,
        awaiting_promotion_selection=bool(state.get("awaiting_promotion_selection")),
        awaiting_promotion_vehicle_selection=bool(state.get("awaiting_promotion_vehicle_selection")),
        awaiting_interest=bool(state.get("awaiting_promotion_vehicle_interest_confirmation")),
        selected_vehicle_id=str(state.get("selected_vehicle_id", "")).strip(),
    )
    promo_candidates_active = _filter_active_promotions(list(state.get("promotion_candidates") or []))
    numbered_promotions = _numbered_promotion_lines(promo_candidates_active) if promo_candidates_active else ""
    nav_flags = classify_promotions_step_flags(
        previous_bot_message=str(state.get("last_bot_message", "")).strip(),
        user_message=user_text,
        current_promotion_title=str(state.get("selected_promotion_title", "")).strip(),
        numbered_promotion_lines=numbered_promotions,
        selected_vehicle_name=str(state.get("selected_car", "")).strip(),
    )
    _debug("nav_flags", **nav_flags)

    if (
        nav_flags.get("wants_compare_two_promotions")
        and state.get("awaiting_promotion_selection")
        and len(promo_candidates_active) >= 2
    ):
        cmp_out = _try_answer_promotion_comparison(state, user_text, promo_candidates_active)
        if cmp_out is not None:
            return cmp_out

    _promotion_flow_active = bool(
        state.get("awaiting_promotion_selection")
        or state.get("awaiting_promotion_vehicle_selection")
        or state.get("awaiting_promotion_vehicle_interest_confirmation")
        or state.get("awaiting_promotion_apply_confirmation")
    )
    _compound_apply_and_financing = bool(
        nav_flags.get("ask_financing")
        and _promotion_flow_active
        and (nav_flags.get("apply_promotion") or nav_flags.get("select_promotion"))
    )
    if nav_flags.get("ask_financing") and not _compound_apply_and_financing:
        state["current_node"] = "financing"
        state["intent"] = "financing"
        _debug("route_change", next_node="financing", reason="financing_requested")
        return state
    if (
        nav_flags.get("ask_other_vehicles")
        and not nav_flags.get("ask_promotions")
        and not _promotion_flow_active
    ):
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        _debug("route_change", next_node="car_selection", reason="other_cars_requested")
        return state

    if state.get("awaiting_promotion_vehicle_interest_confirmation"):
        normalized = normalize_user_text(user_text)
        if nav_flags.get("confirm_no") or any(signal in normalized for signal in NEGATIVE_SIGNALS):
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
                    generate_verified_user_message(
                        mode="operational",
                        verified_facts_block="situacion: usuario_rechazo_vehiculo_promo\nresultado_promociones_fetch: lista_vacia\n",
                        user_message=user_text,
                        fallback="Entendido. En este momento no tengo mas promociones activas para mostrarte.",
                        temperature=0.35,
                    ),
                )
            return _respond_promotion_listing(state, promotions_list)
        if nav_flags.get("confirm_yes") or any(signal in normalized for signal in AFFIRMATIVE_SIGNALS):
            state["awaiting_promotion_vehicle_interest_confirmation"] = False
            state["current_node"] = "lead_capture"
            state["intent"] = "lead_capture"
            return append_assistant_message(
                state,
                generate_verified_user_message(
                    mode="operational",
                    verified_facts_block=(
                        "evento: usuario_confirma_interes_vehiculo_con_promocion\n"
                        f"vehicle_id: {str(state.get('selected_vehicle_id', '')).strip()}\n"
                        f"promocion_titulo: {str(state.get('selected_promotion_title', '')).strip()}\n"
                    ),
                    user_message=user_text,
                    fallback="Perfecto, avancemos con tus datos para aplicar la promocion a este vehiculo.",
                    temperature=0.35,
                ),
            )
        return append_assistant_message(
            state,
            generate_verified_user_message(
                mode="operational",
                verified_facts_block=(
                    "situacion: esperando_confirmacion_si_no\n"
                    f"promocion_titulo: {str(state.get('selected_promotion_title', '')).strip()}\n"
                    f"vehicle_id: {str(state.get('selected_vehicle_id', '')).strip()}\n"
                ),
                user_message=user_text,
                fallback="Solo confirmame si te interesa este vehiculo con la promocion (si o no).",
                temperature=0.35,
            ),
        )

    if state.get("awaiting_promotion_vehicle_selection"):
        selected_vehicle = _pick_vehicle_candidate(state, user_text)
        if not selected_vehicle:
            return append_assistant_message(
                state,
                generate_verified_user_message(
                    mode="operational",
                    verified_facts_block=(
                        "situacion: seleccion_vehiculo_promocion_invalida\n"
                        f"candidatos: {user_text}\n"
                    ),
                    user_message=user_text,
                    fallback="Elige uno de los vehiculos aplicables por nombre o numero para continuar.",
                    temperature=0.35,
                ),
            )
        return _show_vehicle_and_confirm_interest(state, selected_vehicle)

    if state.get("awaiting_promotion_selection"):
        dict_candidates = [item for item in (state.get("promotion_candidates") or []) if isinstance(item, dict)]
        pred_id = str(state.get("selected_promotion_id", "")).strip()

        selected_promotion: dict[str, Any] | None = None
        if (
            pred_id
            and dict_candidates
            and bool(state.get("awaiting_promotion_apply_confirmation"))
            and (nav_flags.get("confirm_yes") or nav_flags.get("apply_promotion"))
        ):
            selected_promotion = next(
                (c for c in dict_candidates if str(c.get("id", "")).strip() == pred_id),
                None,
            )

        if not selected_promotion:
            selected_promotion = _pick_promotion_from_state(state, user_text)

        selection_intent = bool(nav_flags.get("select_promotion") or nav_flags.get("apply_promotion"))
        if (
            not selected_promotion
            and selection_intent
            and numbered_promotions.strip()
            and len(dict_candidates) >= 1
        ):
            payload = extract_promotion_selection_payload(
                previous_bot_message=str(state.get("last_bot_message", "")).strip(),
                user_message=user_text,
                numbered_promotion_lines=numbered_promotions,
            )
            extracted = _resolve_promotion_from_extract(dict_candidates, payload)
            if extracted:
                selected_promotion = extracted
                _debug("promotion_pick", source="llm_extract", title=str(extracted.get("title", "")))

        if not selected_promotion and not selection_intent and pred_id:
            persisted = next(
                (c for c in dict_candidates if str(c.get("id", "")).strip() == pred_id),
                None,
            )
            if isinstance(persisted, dict):
                selected_promotion = persisted
                _debug("promotion_pick", source="persisted_state_id", title=str(persisted.get("title", "")))
            else:
                raw_ids = state.get("selected_promotion_vehicle_ids")
                vid_list = (
                    [str(x).strip() for x in raw_ids if str(x).strip()]
                    if isinstance(raw_ids, list)
                    else []
                )
                title_p = str(state.get("selected_promotion_title", "")).strip()
                if vid_list and title_p:
                    from_state: dict[str, Any] = {
                        "id": pred_id,
                        "title": title_p,
                        "description": str(state.get("selected_promotion_description", "")).strip(),
                        "validUntil": str(state.get("selected_promotion_valid_until", "")).strip(),
                        "vehicleIds": vid_list,
                    }
                    from_state["vehicleLabels"] = _promotion_vehicle_labels(from_state)
                    selected_promotion = from_state
                    _debug("promotion_pick", source="persisted_state_fields", title=title_p)

        if not selected_promotion:
            if selection_intent and dict_candidates:
                return append_assistant_message(
                    state,
                    generate_verified_user_message(
                        mode="operational",
                        verified_facts_block=(
                            "situacion: intencion_seleccion_promocion_sin_match_estable\n"
                            f"lista_numerada:\n{numbered_promotions}\n"
                        ),
                        user_message=user_text,
                        fallback=(
                            "Entendi que quieres elegir una promocion concreta, pero no pude enlazar tu mensaje "
                            "con una sola opcion de la lista. Indica el numero (1, 2, 3) o el titulo tal como aparece arriba."
                        ),
                        temperature=0.35,
                    ),
                )
            return append_assistant_message(
                state,
                generate_verified_user_message(
                    mode="operational",
                    verified_facts_block="situacion: esperando_seleccion_promocion\n",
                    user_message=user_text,
                    fallback=(
                        "Dime cual promocion te interesa por nombre o numero. "
                        "Si quieres aplicarla, confirmalo explicitamente."
                    ),
                    temperature=0.35,
                ),
            )

        _set_selected_promotion(state, selected_promotion)

        # Orquestador principal: primero la senal del LLM apply_promotion,
        # luego heuristica local y por ultimo clasificador auxiliar para casos ambiguos.
        has_explicit_apply = bool(nav_flags.get("apply_promotion"))
        if not has_explicit_apply and _looks_like_explicit_apply(user_text):
            has_explicit_apply = True
        if not has_explicit_apply and len(state.get("promotion_candidates", [])) == 1:
            classify = classify_promotion_selection_intent(
                previous_bot_message=str(state.get("last_bot_message", "")).strip(),
                user_message=user_text,
                promotion_count=1,
                single_promotion_title=str(state.get("selected_promotion_title", "")).strip(),
            )
            has_explicit_apply = classify == "APPLY_SINGLE_PROMOTION"

        if bool(state.get("awaiting_promotion_apply_confirmation")) and (
            nav_flags.get("confirm_yes") or nav_flags.get("apply_promotion")
        ):
            has_explicit_apply = True

        ask_vehicle_info_flag = bool(nav_flags.get("ask_promotion_vehicle_info"))
        if not ask_vehicle_info_flag and _is_vehicle_info_request(user_text):
            ask_vehicle_info_flag = True

        if ask_vehicle_info_flag:
            promotion_vehicles_for_guard = _load_promotion_vehicles(state, selected_promotion)
            if (
                _find_preselected_in_promotion_vehicles(state, promotion_vehicles_for_guard)
                and not _is_vehicle_info_request(user_text)
            ):
                ask_vehicle_info_flag = False
                _debug(
                    "ask_vehicle_info_suppressed",
                    reason="preselected_vehicle_in_promotion",
                    selected_vehicle_id=str(state.get("selected_vehicle_id", "")).strip(),
                )

        if not has_explicit_apply and not ask_vehicle_info_flag:
            title = str(state.get("selected_promotion_title", "")).strip() or "esa promocion"
            platform = str(state.get("platform", "web")).strip().lower() or "web"
            detail_block = format_promotions([selected_promotion], platform=platform)
            state["awaiting_promotion_apply_confirmation"] = True
            return append_assistant_message(
                state,
                generate_verified_user_message(
                    mode="operational",
                    verified_facts_block=(
                        "situacion: promocion_elegida_resumen_y_confirmacion_aplicar\n"
                        f"promocion_titulo: {title}\n\n"
                        "DETALLE_PROMOCION_DATOS_VERIFICADOS:\n"
                        f"{detail_block}\n"
                    ),
                    user_message=user_text,
                    fallback=(
                        f"Aqui tienes el detalle de **{title}**:\n\n{detail_block}\n\n"
                        "Si es la promocion correcta y deseas aplicarla a tu compra, dimelo con un si claro "
                        "(por ejemplo: si, quiero aplicarla o confirmo que esa es)."
                    ),
                    temperature=0.35,
                ),
            )

        if ask_vehicle_info_flag:
            state["awaiting_promotion_apply_confirmation"] = False
            promotion_vehicles = _load_promotion_vehicles(state, selected_promotion)
            hinted_vehicle = _pick_vehicle_from_list_by_text(promotion_vehicles, user_text)
            if isinstance(hinted_vehicle, dict):
                hinted_id = str(hinted_vehicle.get("id", "")).strip()
                if hinted_id:
                    for candidate in promotion_vehicles:
                        candidate_id = str(candidate.get("id", "")).strip()
                        if candidate_id and candidate_id == hinted_id:
                            state["selected_vehicle_id"] = hinted_id
                            state["selected_car"] = format_vehicle_name(candidate)
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
                    state["selected_car"] = format_vehicle_name(only_vehicle)
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
                    f"{idx}. {format_vehicle_name(item)}"
                    for idx, item in enumerate(promotion_vehicles, start=1)
                )
                return append_assistant_message(
                    state,
                    generate_verified_user_message(
                        mode="inventory_candidates",
                        verified_facts_block=(
                            "CONTEXTO: Esta promocion aplica a varios vehiculos.\n\n"
                            f"LISTA_OPCIONES:\n{options}\n"
                        ),
                        user_message=user_text,
                        fallback=(
                            f"Esta promocion aplica a varios vehiculos:\n{options}\n\n"
                            "Dime cual quieres ver por nombre o numero."
                        ),
                        temperature=0.45,
                    ),
                )

        if has_explicit_apply:
            chained = _try_apply_promotion_to_preselected_vehicle(
                state,
                selected_promotion,
                chain_financing=bool(nav_flags.get("ask_financing")),
            )
            if chained is not None:
                return chained

        state["awaiting_promotion_apply_confirmation"] = False
        promotion_vehicles = _load_promotion_vehicles(state, selected_promotion)
        if not promotion_vehicles:
            state["awaiting_promotion_selection"] = True
            return append_assistant_message(
                state,
                generate_verified_user_message(
                    mode="operational",
                    verified_facts_block=(
                        "situacion: promocion_sin_vehiculos_disponibles\n"
                        f"promocion_id: {str(selected_promotion.get('id', '')).strip()}\n"
                    ),
                    user_message=user_text,
                    fallback=(
                        "Esta promocion no tiene vehiculos disponibles en este momento. "
                        "Si quieres, te muestro otras promociones."
                    ),
                    temperature=0.35,
                ),
            )

        state["awaiting_promotion_apply_confirmation"] = False
        state["awaiting_promotion_selection"] = False
        state["promotion_vehicle_candidates"] = promotion_vehicles
        if len(promotion_vehicles) == 1:
            return _show_vehicle_and_confirm_interest(state, promotion_vehicles[0])

        options = "\n".join(f"{idx}. {format_vehicle_name(item)}" for idx, item in enumerate(promotion_vehicles, start=1))
        state["awaiting_promotion_vehicle_selection"] = True
        message = generate_verified_user_message(
            mode="inventory_candidates",
            verified_facts_block=(
                "CONTEXTO: Vehiculos aplicables a la promocion seleccionada.\n\n"
                f"LISTA_OPCIONES:\n{options}\n"
            ),
            user_message=user_text,
            fallback=(
                f"Estos son los vehiculos aplicables a la promocion:\n{options}\n\n"
                "Cual quieres revisar primero?"
            ),
            temperature=0.45,
        )
        return append_assistant_message(state, message)

    selected_vehicle_id = str(state.get("selected_vehicle_id", "")).strip()

    if selected_vehicle_id and (nav_flags.get("ask_promotions") or state.get("selected_car")):
        try:
            by_vehicle = _filter_active_promotions(fetch_promotions_by_vehicle(selected_vehicle_id))
        except Exception:
            by_vehicle = []
        if by_vehicle:
            hydrated_promotions = _hydrate_promotions_with_vehicle_labels(by_vehicle)
            if not hydrated_promotions:
                selected_car_name = str(state.get("selected_car", "")).strip() or "este vehiculo"
                state["awaiting_purchase_confirmation"] = True
                state["skip_car_prompt"] = True
                state["current_node"] = "car_selection"
                state["intent"] = "vehicle_catalog"
                return append_assistant_message(
                    state,
                    generate_verified_user_message(
                        mode="operational",
                        verified_facts_block=(
                            "operacion: fetch_promotions_by_vehicle\n"
                            f"vehicle_id: {selected_vehicle_id}\n"
                            f"vehicle_etiqueta: {selected_car_name}\n"
                            "resultado: lista_hidratada_vacia\n"
                        ),
                        user_message=user_text,
                        fallback=(
                            f"No encontre promociones aplicables para {selected_car_name} en este momento. "
                            "Si quieres, podemos continuar con este vehiculo, ver otros modelos o revisar promociones generales."
                        ),
                        temperature=0.35,
                    ),
                )
            state["promotion_candidates"] = hydrated_promotions
            state["awaiting_promotion_selection"] = True
            state["awaiting_promotion_apply_confirmation"] = False
            car_name = str(state.get("selected_car", "")).strip() or "este vehiculo"
            listing = format_promotions(hydrated_promotions, platform=str(state.get("platform", "web")))
            question = generate_promotion_listing_user_message(
                user_text=user_text,
                listing_block=f"Vehiculo: {car_name}\n\nPromociones aplicables:\n{listing}",
                closing_hint="Si deseas aplicar una, dime cual y confirmalo explicitamente.",
                fallback_semantic=f"Claro, para {car_name} estas son las promociones que si aplican.",
            )
            return append_assistant_message(state, question)
        selected_car_name = str(state.get("selected_car", "")).strip() or "este vehiculo"
        state["awaiting_purchase_confirmation"] = True
        state["skip_car_prompt"] = True
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        return append_assistant_message(
            state,
            generate_verified_user_message(
                mode="operational",
                verified_facts_block=(
                    "operacion: fetch_promotions_by_vehicle\n"
                    f"vehicle_id: {selected_vehicle_id}\n"
                    f"vehicle_etiqueta: {selected_car_name}\n"
                    "resultado: sin_promociones_en_respuesta_api\n"
                ),
                user_message=user_text,
                fallback=(
                    f"No encontre promociones para {selected_car_name} en este momento. "
                    "Si quieres, podemos continuar con este vehiculo, ver otros modelos o revisar promociones generales."
                ),
                temperature=0.35,
            ),
        )

    try:
        promotions_list = _filter_active_promotions(fetch_promotions())
    except Exception:
        promotions_list = []
    if not promotions_list:
        return append_assistant_message(
            state,
            generate_verified_user_message(
                mode="operational",
                verified_facts_block=(
                    "operacion: fetch_promotions_generales\n"
                    "resultado: lista_vacia\n"
                ),
                user_message=user_text,
                fallback="No hay promociones disponibles en este momento. Si quieres, revisamos vehiculos o financiamiento.",
                temperature=0.35,
            ),
        )
    return _respond_promotion_listing(state, promotions_list)