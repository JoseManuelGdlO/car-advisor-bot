"""Nodo de cierre: preferencia de contacto y, si aplica, link de calendario."""

from __future__ import annotations

from typing import Any

from src.state import clientState
from src.tools.database import push_event_to_backend
from src.tools.vehicles import notify_advisor
from src.utils.bot_control import deactivate_bot
from src.utils.financing_advisor_notify import (
    append_visit_incentive_if_configured,
    resolve_client_display_phone,
)
from src.services.llm_responses import (
    classify_lead_capture_navigation,
    generate_lead_capture_scheduling_message,
    generate_verified_user_message,
    get_calendar_scheduling_url,
)
from src.utils.app_logging import get_app_logger, log_flow_trace
from src.utils.state_helpers import append_assistant_message, latest_user_message

_log = get_app_logger("lead_capture")

CONTACT_THANKS_MESSAGE = "Listo, ya avise para que te contacten 😊"

_VALID_CONTACT_METHODS = frozenset({"whatsapp", "call", "appointment"})


def _debug(event: str, **payload: Any) -> None:
    """Trazas de depuracion; payload completo solo con LOG_LEVEL=debug."""

    log_flow_trace(_log, "lead_capture", event, **payload)


def _last_assistant_content(state: clientState) -> str:
    for m in reversed(state.get("messages", [])):
        if m.get("role") == "assistant":
            return str(m.get("content", ""))
    return ""


def _normalize_contact_method(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    if value in _VALID_CONTACT_METHODS:
        return value
    return ""


def _detect_navigation_override(user_text: str, previous_bot_message: str, selected_car: str) -> str:
    """Detecta cambio de flujo en lead_capture usando clasificacion LLM especializada."""
    if not str(user_text or "").strip():
        return ""
    classified = classify_lead_capture_navigation(
        previous_bot_message=previous_bot_message,
        user_message=user_text,
        selected_vehicle_name=selected_car,
    )
    if classified == "PROMOTIONS":
        return "promotions"
    if classified == "FINANCING":
        return "financing"
    if classified == "CAR_SELECTION":
        return "car_selection"
    return ""


def _intent_for_route_override(route_override: str) -> str:
    if route_override == "car_selection":
        return "vehicle_catalog"
    return route_override


def _financing_selection(state: clientState, selected_car: str) -> dict[str, Any]:
    financing_selection = {
        "plan_id": str(state.get("selected_financing_plan_id", "")).strip(),
        "plan_name": str(state.get("selected_financing_plan_name", "")).strip(),
        "lender": str(state.get("selected_financing_plan_lender", "")).strip(),
        "vehicle_id": str(state.get("selected_vehicle_id", "")).strip(),
        "vehicle_name": selected_car,
    }
    if not any(financing_selection.values()):
        return {}
    return financing_selection


def _promotion_selection(state: clientState, selected_car: str) -> dict[str, Any]:
    promotion_selection = {
        "promotion_id": str(state.get("selected_promotion_id", "")).strip(),
        "title": str(state.get("selected_promotion_title", "")).strip(),
        "description": str(state.get("selected_promotion_description", "")).strip(),
        "valid_until": str(state.get("selected_promotion_valid_until", "")).strip(),
        "vehicle_ids": state.get("selected_promotion_vehicle_ids", []),
        "vehicle_id": str(state.get("selected_vehicle_id", "")).strip(),
        "vehicle_name": selected_car,
    }
    has_promotion = bool(
        promotion_selection["promotion_id"]
        or promotion_selection["title"]
        or promotion_selection["description"]
    )
    if not has_promotion:
        return {}
    return promotion_selection


_VALID_TRANSMISSIONS = frozenset({"automatico", "estandar"})
_VALID_PAYMENT_TYPES = frozenset({"contado", "financiado"})


def _purchase_preferences(state: clientState) -> dict[str, str]:
    transmission = str(state.get("selected_transmission", "")).strip().lower()
    payment_type = str(state.get("selected_payment_type", "")).strip().lower()
    prefs: dict[str, str] = {}
    if transmission in _VALID_TRANSMISSIONS:
        prefs["transmission"] = transmission
    if payment_type in _VALID_PAYMENT_TYPES:
        prefs["payment_type"] = payment_type
    return prefs


def _ficha_summary_message(selected_car: str, purchase_preferences: dict[str, str]) -> str:
    lines = ["Cliente interesado en:", selected_car]
    transmission = purchase_preferences.get("transmission", "")
    payment_type = purchase_preferences.get("payment_type", "")
    if transmission:
        lines.append(transmission)
    if payment_type:
        lines.append(payment_type)
    return "\n".join(lines)


def _push_body_for_contact_method(contact_method: str, *, display_phone: str, selected_car: str) -> str:
    if contact_method == "whatsapp":
        return f"{display_phone} prefiere contacto por WhatsApp sobre {selected_car}."
    if contact_method == "call":
        return f"{display_phone} prefiere contacto por llamada sobre {selected_car}."
    return (
        f"{display_phone} recibio el enlace para agendar prueba de manejo o visita "
        f"de {selected_car}."
    )


def _push_title_for_contact_method(contact_method: str) -> str:
    if contact_method in {"whatsapp", "call"}:
        return "Interes en contacto de vehiculo"
    return "Interes en agenda de vehiculo"


def _notify_and_persist(
    state: clientState,
    *,
    selected_car: str,
    platform: str,
    user_id: str,
    owner_user_id: str,
    contact_method: str,
) -> bool:
    """Envia evento CRM y push al owner; devuelve si notify_advisor tuvo exito."""

    uid = str(user_id or "").strip() or "lead"
    financing_selection = _financing_selection(state, selected_car)
    promotion_selection = _promotion_selection(state, selected_car)
    purchase_preferences = _purchase_preferences(state)
    resolved_method = contact_method or "appointment"

    _debug(
        "notify_payload_ready",
        selected_car=selected_car,
        owner_user_id=owner_user_id,
        contact_method=resolved_method,
        financing_selection=financing_selection,
        promotion_selection=promotion_selection,
        purchase_preferences=purchase_preferences,
    )
    push_event_to_backend(
        {
            "user_id": uid,
            "platform": platform,
            "message": _ficha_summary_message(selected_car, purchase_preferences),
            "from": "system",
            "selected_car": selected_car,
            "customer_info": {},
            "financing_selection": financing_selection,
            "promotion_selection": promotion_selection,
            "purchase_preferences": purchase_preferences,
            "contact_method": resolved_method,
        }
    )

    if not owner_user_id:
        _debug("notify_skipped_missing_owner_user_id")
        return False

    try:
        display_phone = resolve_client_display_phone(state)
        notify_advisor(
            selected_car,
            {},
            owner_user_id=owner_user_id,
            financing_selection=financing_selection or None,
            promotion_selection=promotion_selection or None,
            push_title=_push_title_for_contact_method(resolved_method),
            push_body=_push_body_for_contact_method(
                resolved_method,
                display_phone=display_phone,
                selected_car=selected_car,
            ),
        )
        _debug("notify_success")
        return True
    except Exception:
        _debug("notify_failed")
        return False


def _append_scheduling_message(
    state: clientState,
    *,
    selected_car: str,
    resuming: bool,
) -> clientState:
    state = append_visit_incentive_if_configured(state)
    message = generate_lead_capture_scheduling_message(selected_car, resuming=resuming)
    return append_assistant_message(state, message)


def _append_thanks_message(state: clientState) -> clientState:
    state = append_visit_incentive_if_configured(state)
    return append_assistant_message(state, CONTACT_THANKS_MESSAGE)


def _no_vehicle_message(state: clientState, latest_user: str) -> clientState:
    return append_assistant_message(
        state,
        generate_verified_user_message(
            mode="operational",
            verified_facts_block="situacion: lead_capture_sin_vehiculo_seleccionado\n",
            user_message=latest_user,
            fallback="Primero debes elegir un vehiculo para continuar.",
            temperature=0.35,
        ),
    )


def _already_done_message(state: clientState, selected_car: str, latest_user: str) -> clientState:
    name = selected_car or "tu vehiculo"
    contact_method = _normalize_contact_method(state.get("contact_method"))
    if contact_method in {"whatsapp", "call"}:
        fallback = f"Ya registramos tu preferencia de contacto para {name}."
        facts = (
            "evento: lead_capture_ya_completado_en_estado\n"
            f"vehiculo_seleccionado: {name}\n"
            f"contact_method: {contact_method}\n"
            "enlace_ya_compartido: false\n"
        )
    else:
        fallback = f"Ya te compartimos el enlace para agendar tu cita con {name}."
        facts = (
            "evento: lead_capture_ya_completado_en_estado\n"
            f"vehiculo_seleccionado: {name}\n"
            "enlace_ya_compartido: true\n"
        )
    return append_assistant_message(
        state,
        generate_verified_user_message(
            mode="operational",
            verified_facts_block=facts,
            user_message=latest_user,
            fallback=fallback,
            temperature=0.35,
        ),
    )


def lead_capture(state: clientState) -> clientState:
    """Cierra lead segun contact_method: gracias (whatsapp/call) o link de agenda (cita)."""

    state["current_node"] = "lead_capture"
    if state.get("suppress_commercial_node_once"):
        state["suppress_commercial_node_once"] = False
        _debug("suppress_commercial_node_once", action="skip_node_execution")
        return state

    selected_car = (state.get("selected_car") or "").strip()
    platform = str(state.get("platform", "web") or "web").strip().lower() or "web"
    user_id = str(state.get("user_id", "")).strip()
    owner_user_id = str(state.get("owner_user_id", "")).strip()
    latest_user = latest_user_message(state)
    contact_method = _normalize_contact_method(state.get("contact_method"))
    if not contact_method:
        contact_method = "appointment"
        state["contact_method"] = contact_method

    _debug(
        "entry",
        selected_car=selected_car,
        platform=platform,
        contact_method=contact_method,
        lead_capture_done=bool(state.get("lead_capture_done")),
        latest_user=latest_user,
    )

    if state.get("lead_capture_done"):
        state["current_node"] = "router"
        state["intent"] = ""
        return _already_done_message(state, selected_car, latest_user)

    if not selected_car:
        return _no_vehicle_message(state, latest_user)

    route_override = _detect_navigation_override(
        latest_user,
        _last_assistant_content(state),
        selected_car,
    )
    if route_override:
        state["current_node"] = route_override
        state["intent"] = _intent_for_route_override(route_override)
        _debug("route_change", next_node=route_override, reason="user_navigation_override")
        return state

    resuming = bool(state.get("skip_lead_prompt"))
    if state.get("skip_lead_prompt"):
        state["skip_lead_prompt"] = False

    if contact_method in {"whatsapp", "call"}:
        state = _append_thanks_message(state)
        notify_success = _notify_and_persist(
            state,
            selected_car=selected_car,
            platform=platform,
            user_id=user_id,
            owner_user_id=owner_user_id,
            contact_method=contact_method,
        )
        _debug("contact_thanks_shown", contact_method=contact_method, notify_success=notify_success)
    else:
        state = _append_scheduling_message(state, selected_car=selected_car, resuming=resuming)
        notify_success = _notify_and_persist(
            state,
            selected_car=selected_car,
            platform=platform,
            user_id=user_id,
            owner_user_id=owner_user_id,
            contact_method=contact_method,
        )
        _debug(
            "scheduling_link_shown",
            calendar_url=get_calendar_scheduling_url(),
            notify_success=notify_success,
        )

    state["lead_capture_done"] = True
    state["current_node"] = "router"
    state["intent"] = ""
    return deactivate_bot(state, reason="lead_capture")
