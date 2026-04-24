"""Nodo para detectar intencion FAQ interruptiva."""

from src.state import clientState

from src.services.llm_responses import classify_faq_interrupt_intent
from src.tools.vehicles import normalize_user_text
from src.utils.state_helpers import is_faq_intent, latest_human_ai_pair


def _looks_like_flow_short_reply(user_text: str) -> bool:
    """Evita falsos FAQ para respuestas cortas tipicas de flujo."""

    normalized = user_text.strip().lower()
    if not normalized:
        return False
    short_replies = {
        "si",
        "sí",
        "no",
        "ok",
        "vale",
        "claro",
        "quiero",
        "adelante",
        "otro",
        "otros",
    }
    return normalized in short_replies


def _looks_like_more_images_reply(user_text: str) -> bool:
    """Reconoce pedidos de mas imagenes/fotos como continuidad de flujo."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    signals = {
        "mas imagenes",
        "ver mas imagenes",
        "mas fotos",
        "ver mas fotos",
        "siguientes imagenes",
        "siguientes fotos",
    }
    return any(signal in normalized for signal in signals)


def _looks_like_financing_request(user_text: str) -> bool:
    """Evita enviar a FAQ cuando el mensaje trata de financiamiento."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    signals = {
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
    return any(signal in normalized for signal in signals)


def intent_checker(state: clientState) -> clientState:
    """Evalua ultimo par Human/AI para decidir continuidad o interrupcion FAQ."""

    last_user, last_ai = latest_human_ai_pair(state)
    if not last_user:
        return state

    current_node = str(state.get("current_node", "router"))
    # El intent_checker corre antes del router: fuera de flujo no debe marcar FAQ interruptiva.
    if current_node in {"", "start", "router", "faq"}:
        state["is_faq_interrupt"] = False
        return state

    # Si no hay mensaje previo del bot, no existe interrupcion de flujo.
    if not last_ai:
        state["is_faq_interrupt"] = False
        return state

    if _looks_like_financing_request(last_user):
        state["is_faq_interrupt"] = False
        return state

    if state.get("awaiting_purchase_confirmation") and _looks_like_flow_short_reply(last_user):
        state["is_faq_interrupt"] = False
        return state

    if state.get("awaiting_purchase_confirmation") and _looks_like_more_images_reply(last_user):
        state["is_faq_interrupt"] = False
        return state

    if state.get("last_vehicle_candidates") and _looks_like_flow_short_reply(last_user):
        state["is_faq_interrupt"] = False
        return state

    if current_node in {"car_selection", "lead_capture", "financing"} and _looks_like_flow_short_reply(last_user):
        state["is_faq_interrupt"] = False
        return state

    decision = classify_faq_interrupt_intent(current_node, last_ai, last_user)
    if decision == "FAQ":
        state["is_faq_interrupt"] = True
        state["resume_to_step"] = current_node or "car_selection"
        state["current_node"] = "faq"
        state["skip_car_prompt"] = True
        state["skip_lead_prompt"] = True
        return state

    if decision == "FLOW_RESPONSE":
        state["is_faq_interrupt"] = False
        return state

    if is_faq_intent(last_user):
        state["is_faq_interrupt"] = True
        state["resume_to_step"] = current_node or "car_selection"
        state["current_node"] = "faq"
        state["skip_car_prompt"] = True
        state["skip_lead_prompt"] = True
        return state

    state["is_faq_interrupt"] = False
    return state
