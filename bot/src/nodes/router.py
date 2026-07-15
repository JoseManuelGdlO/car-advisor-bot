"""Router conversacional para definir el siguiente paso del flujo."""

from __future__ import annotations

from src.state import clientState

from src.services.llm_responses import classify_router_intent, generate_other_response
from src.tools.vehicles import normalize_user_text
from src.utils.human_advisor_notify import handle_human_advisor_request
from src.utils.financing_advisor_notify import maybe_escalate_financing_detail
from src.utils.signals import is_greeting_only_message
from src.utils.app_logging import get_app_logger, log_flow_trace
from src.utils.state_helpers import (
    append_assistant_message,
    latest_user_message,
)

_log = get_app_logger("router")

_VALID_ROUTER_LABELS = frozenset({"VEHICLE_CATALOG", "FAQ", "FINANCING", "PROMOTIONS", "HUMAN_ADVISOR"})


def _debug_router(event: str, **payload: object) -> None:
    """Trazas de decisión del router para seguir en consola."""

    log_flow_trace(_log, "router", event, **payload)


def _sanitize_previous_intent_for_classifier(intent: str) -> str:
    """Evita sesgo 'Intent previo: faq' en el clasificador LLM."""

    cleaned = str(intent or "").strip()
    if cleaned == "faq":
        return "other"
    return cleaned


def _apply_router_resolution(
    state: clientState,
    resolved: str,
    *,
    reason: str,
) -> clientState:
    """Aplica etiqueta resuelta a intent/current_node."""

    if resolved == "VEHICLE_CATALOG":
        state["intent"] = "vehicle_catalog"
        state["current_node"] = "car_selection"
        _debug_router("route_to_car_selection", reason=reason)
        return state
    if resolved == "FAQ":
        state["intent"] = "faq"
        state["current_node"] = "faq"
        _debug_router("route_to_faq", reason=reason)
        return state
    if resolved == "PROMOTIONS":
        state["intent"] = "promotions"
        state["current_node"] = "promotions"
        _debug_router("route_to_promotions", reason=reason)
        return state
    if resolved == "FINANCING":
        state["intent"] = "financing"
        state["current_node"] = "financing"
        _debug_router("route_to_financing", reason=reason)
        return state
    if resolved == "HUMAN_ADVISOR":
        state["intent"] = "human_advisor"
        state["current_node"] = "router"
        _debug_router("route_human_advisor", reason=reason)
        return handle_human_advisor_request(state, advisor_trigger="router_resolution_human_advisor")
    raise ValueError(f"etiqueta router no soportada: {resolved!r}")


def _skip_duplicate_other_after_onboarding_welcome(state: clientState, *, reason: str) -> clientState:
    """Evita segunda bienvenida cuando onboarding ya saludo en este invoke."""

    state["onboarding_welcome_sent_this_turn"] = False
    state["intent"] = "other"
    _debug_router("route_to_other", reason=reason)
    return state


def _other_response_kwargs(state: clientState) -> dict[str, object]:
    """Contexto de onboarding para respuestas en intent other."""

    info = state.get("customer_info")
    customer_name = ""
    if isinstance(info, dict):
        customer_name = str(info.get("nombre", "")).strip()
    return {
        "customer_name": customer_name,
        "onboarding_greeting_done": bool(state.get("onboarding_greeting_done")),
    }


def router(state: clientState) -> clientState:
    """Clasifica intención básica y enruta el flujo conversacional."""

    state["current_node"] = "router"
    if state.get("bot_disabled") or state.get("financing_detail_push_sent"):
        _debug_router("skip_already_escalated")
        return state

    user_text = latest_user_message(state)
    text = normalize_user_text(user_text)
    _debug_router(
        "entry",
        user_text=user_text,
        normalized_text=text,
        previous_intent=state.get("intent", ""),
        awaiting_purchase_confirmation=bool(state.get("awaiting_purchase_confirmation")),
        pending_candidates=bool(state.get("last_vehicle_candidates")),
    )

    if state.get("awaiting_purchase_confirmation") or state.get("last_vehicle_candidates"):
        state["intent"] = "vehicle_catalog"
        state["current_node"] = "car_selection"
        _debug_router("route_to_car_selection", reason="state_flags")
        return state

    if state.get("intent") == "vehicle_catalog" and text:
        state["current_node"] = "car_selection"
        _debug_router("route_to_car_selection", reason="vehicle_catalog_context")
        return state
    if state.get("intent") == "financing" and text:
        state["current_node"] = "financing"
        _debug_router("route_to_financing", reason="financing_context")
        return state
    if state.get("intent") == "promotions" and text:
        state["current_node"] = "promotions"
        _debug_router("route_to_promotions", reason="promotions_context")
        return state

    if state.get("onboarding_greeting_done") and is_greeting_only_message(user_text):
        state["intent"] = "other"
        _debug_router("route_to_other", reason="post_onboarding_greeting_skip")
        return state

    if not text:
        if state.get("onboarding_welcome_sent_this_turn"):
            return _skip_duplicate_other_after_onboarding_welcome(state, reason="empty_after_onboarding_welcome")
        state["intent"] = "other"
        message = generate_other_response(user_text, **_other_response_kwargs(state))
        _debug_router("route_to_other", reason="empty")
        return append_assistant_message(state, message)

    previous_intent_sanitized = _sanitize_previous_intent_for_classifier(str(state.get("intent", "")))
    llm_intent = classify_router_intent(user_text, previous_intent_sanitized)
    _debug_router(
        "llm_intent",
        llm_intent=llm_intent,
        previous_intent_sanitized=previous_intent_sanitized,
    )

    if llm_intent in _VALID_ROUTER_LABELS:
        if state.get("onboarding_welcome_sent_this_turn"):
            state["onboarding_welcome_sent_this_turn"] = False
        # FAQ diferida en captura de nombre: el pending comercial va primero.
        if (
            llm_intent == "FAQ"
            and str(state.get("deferred_faq_user_message", "")).strip()
            and str(state.get("onboarding_resume_user_message", "")).strip()
        ):
            _debug_router(
                "defer_faq_prefer_commercial",
                resume=str(state.get("onboarding_resume_user_message", ""))[:120],
            )
            llm_intent = "VEHICLE_CATALOG"
        _debug_router("resolved_intent", resolved=llm_intent, reason="llm_classifier")
        if llm_intent == "FINANCING":
            escalated = maybe_escalate_financing_detail(state, trigger="router_financing_intent")
            if escalated is not None:
                return escalated
        return _apply_router_resolution(state, llm_intent, reason="llm_classifier")

    if state.get("onboarding_welcome_sent_this_turn"):
        return _skip_duplicate_other_after_onboarding_welcome(state, reason="llm_unknown_after_onboarding_welcome")
    state["intent"] = "other"
    message = generate_other_response(user_text, **_other_response_kwargs(state))
    _debug_router("route_to_other", reason="llm_unknown")
    return append_assistant_message(state, message)
