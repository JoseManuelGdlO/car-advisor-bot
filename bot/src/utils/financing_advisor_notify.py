"""Escalacion: dudas detalladas de credito/financiamiento (push + handoff humano)."""

from __future__ import annotations

import logging
import re
from typing import Any

from src.services.llm_responses import classify_financing_detail_escalation
from src.state import clientState
from src.tools.database import get_bot_settings, push_event_to_backend
from src.tools.vehicles import normalize_user_text, notify_advisor
from src.utils.app_logging import get_app_logger
from src.utils.bot_control import deactivate_bot
from src.utils.state_helpers import append_assistant_message, latest_human_ai_pair

logger = logging.getLogger(__name__)
_app = get_app_logger("financing_advisor")

_CHANNEL_ID_RE = re.compile(r"@(lid|s\.whatsapp\.net)$", re.IGNORECASE)

# Pide ver/listar planes publicados del catalogo (tolera typos como "financieamiento").
_FINANCING_CATALOG_REQUEST_SUBSTR: frozenset[str] = frozenset(
    (
        "planes de financ",
        "plan de financ",
        "que planes",
        "cuales son los planes",
        "opciones de financ",
        "opciones de credito",
        "ver planes",
        "mostrar planes",
        "listar planes",
        "planes disponibles",
        "planes tienen",
        "plan de credito",
        "planes de credito",
        "informacion de planes",
        "info de planes",
    )
)

# Dudas personalizadas de credito: no tratar como consulta de catalogo.
_FINANCING_PERSONALIZED_SUBSTR: frozenset[str] = frozenset(
    (
        "me aprueban",
        "me aprueba",
        "mi buro",
        "mal buro",
        "mi historial",
        "mi ingreso",
        "mi caso",
        "en mi caso",
        "califico",
        "comprobante informal",
        "refinanciar",
        "excepcion",
        "negociar",
        "para mi situacion",
        "puedo financiar con",
        "que detalles revisan",
        "como revisan mi",
    )
)

# Cotizacion/calculo personalizado de CREDITO: debe escalar a asesor humano.
# "cotizar"/"cotizacion" solos NO bastan: suelen ser interes por un vehiculo
# (ej. "quiero cotizar el Swift"). Requieren contexto de financiamiento.
_FINANCING_PERSONALIZED_QUOTE_SUBSTR: frozenset[str] = frozenset(
    (
        "cuanto seria",
        "cuanto seria de",
        "cuanto seria el",
        "cuanto seria la",
        "cuanto quedaria",
        "cuanto quedaria de",
        "cuanto pagaria",
        "cuanto pagaria de",
        "cuanto me sale",
        "cuanto me costaria",
        "cuanto daria de",
        "enganche y mensualidad",
        "mensualidad y enganche",
        "cuanto de enganche",
        "cuanto de mensualidad",
        "calcular enganche",
        "calcular mensualidad",
        "cotizar enganche",
        "cotizar mensualidad",
        "cotizar el credito",
        "cotizar credito",
        "cotizar financ",
        "cotizacion de enganche",
        "cotizacion de mensualidad",
        "cotizacion de credito",
        "cotizacion de financ",
        "cotizame el enganche",
        "cotizame la mensualidad",
        "cotizame el credito",
    )
)

# Terminos de interes por cotizar un vehiculo (sin credito personalizado).
_VEHICLE_QUOTE_SUBSTR: frozenset[str] = frozenset(
    (
        "cotizar",
        "cotizacion",
        "cotizame",
        "presupuesto",
    )
)

# Contexto de financiamiento que convierte una "cotizacion" en duda de credito.
_FINANCING_QUOTE_CONTEXT_SUBSTR: frozenset[str] = frozenset(
    (
        "enganche",
        "mensualidad",
        "mensualidades",
        "credito",
        "financ",
        "tasa",
        "plazo",
        "plazos",
        "pago mensual",
        "pagaria",
        "buro",
        "aprueba",
        "aprueban",
    )
)

_CATALOG_RATE_TERMS: frozenset[str] = frozenset(
    ("tasa", "enganche", "mensualidad", "mensualidades", "plazo", "plazos")
)

# Contexto que vuelve PERSONALIZADA una pregunta de enganche (calculo/caso propio).
# Sin estos terminos, una duda de enganche es generica y se responde con el
# mensaje publicado de enganche (downPaymentMessage), sin escalar a asesor.
_ENGANCHE_PERSONALIZED_CONTEXT_SUBSTR: frozenset[str] = frozenset(
    (
        "mensualidad",
        "mensualidades",
        "pago mensual",
        "pagaria",
        "al mes",
        "buro",
        "aprueba",
        "aprueban",
        "mi caso",
        "mi ingreso",
        "mi historial",
        "refinanciar",
        "negociar",
        "excepcion",
        "menos enganche",
        "menor enganche",
        "bajar el enganche",
        "sin enganche",
    )
)

# Plazo concreto a la medida ("a 24 meses", "en 36 anios") junto a credito/plan.
_CUSTOM_TERM_PLAZO_RE = re.compile(
    r"\b(?:a|en)\s+\d{1,3}\s*(?:meses?|anios?|anos?)\b",
    re.IGNORECASE,
)
_CUSTOM_TERM_CONTEXT_SUBSTR: frozenset[str] = frozenset(
    ("plan", "credito", "financ", "pagarlo", "pagar", "mensual", "armame")
)

ADVISOR_HELP_PUSH_TITLE = "Cliente necesita ayuda"
ADVISOR_HELP_PUSH_BODY_SUFFIX = "necesita ayuda para resolver dudas"


def _looks_like_display_phone(value: str) -> bool:
    cleaned = str(value or "").strip()
    if not cleaned or _CHANNEL_ID_RE.search(cleaned):
        return False
    digits = re.sub(r"\D", "", cleaned)
    return len(digits) >= 7


def is_vehicle_quote_without_financing_context(text: str) -> bool:
    """True si pide cotizar un vehiculo/modelo sin duda personalizada de credito."""

    normalized = normalize_user_text(text)
    if not normalized:
        return False
    if not any(term in normalized for term in _VEHICLE_QUOTE_SUBSTR):
        return False
    if any(term in normalized for term in _FINANCING_QUOTE_CONTEXT_SUBSTR):
        return False
    return True


def is_financing_personalized_quote_request(text: str) -> bool:
    """True si el usuario pide cotizacion o calculo personalizado de credito."""

    normalized = normalize_user_text(text)
    if not normalized:
        return False
    if is_vehicle_quote_without_financing_context(normalized):
        return False
    return any(term in normalized for term in _FINANCING_PERSONALIZED_QUOTE_SUBSTR)


def is_custom_term_financing_request(text: str) -> bool:
    """True si pide un plazo concreto (N meses/anios) para financiar SU compra."""

    normalized = normalize_user_text(text)
    if not normalized:
        return False
    if not _CUSTOM_TERM_PLAZO_RE.search(normalized):
        return False
    return any(term in normalized for term in _CUSTOM_TERM_CONTEXT_SUBSTR)


def is_financing_catalog_request(text: str) -> bool:
    """True si el usuario pide ver/listar planes o condiciones publicadas del catalogo."""

    normalized = normalize_user_text(text)
    if not normalized:
        return False
    if is_financing_personalized_quote_request(normalized):
        return False
    if is_custom_term_financing_request(normalized):
        return False
    if any(term in normalized for term in _FINANCING_PERSONALIZED_SUBSTR):
        return False
    if any(term in normalized for term in _FINANCING_CATALOG_REQUEST_SUBSTR):
        return True
    if any(term in normalized for term in _CATALOG_RATE_TERMS):
        return True
    return False


def build_advisor_help_push_copy(state: clientState) -> tuple[str, str]:
    """Titulo/cuerpo unificados para push de escalacion a asesor."""

    display_phone = resolve_client_display_phone(state)
    return ADVISOR_HELP_PUSH_TITLE, f"{display_phone} {ADVISOR_HELP_PUSH_BODY_SUFFIX}"


def resolve_client_display_phone(state: clientState) -> str:
    """Prioridad: display_phone CRM, telefono legible en customer_info, user_id."""

    display = str(state.get("display_phone", "")).strip()
    if _looks_like_display_phone(display):
        return display

    info = state.get("customer_info")
    telefono = ""
    if isinstance(info, dict):
        telefono = str(info.get("telefono", "")).strip()
        if _looks_like_display_phone(telefono):
            return telefono

    user_id = str(state.get("user_id", "")).strip()
    if _looks_like_display_phone(user_id):
        return user_id
    digits = re.sub(r"\D", "", user_id)
    if len(digits) >= 7:
        return digits
    return display or telefono or user_id or "Cliente"


def _clean_customer_info(info: Any) -> dict[str, str]:
    if not isinstance(info, dict):
        return {}
    out: dict[str, str] = {}
    for k in ("nombre", "telefono", "email"):
        v = info.get(k)
        if v is not None and str(v).strip():
            out[k] = str(v).strip()
    return out


def _already_escalated(state: clientState) -> bool:
    return bool(
        state.get("bot_disabled")
        or state.get("financing_detail_push_sent")
        or state.get("human_advisor_push_sent")
    )


def _numbered_plan_lines(state: clientState) -> str:
    candidates = state.get("financing_plan_candidates", [])
    if not isinstance(candidates, list):
        return ""
    lines: list[str] = []
    for idx, item in enumerate(candidates, start=1):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip() or f"Plan {idx}"
        lender = str(item.get("lender", "")).strip()
        lines.append(f"{idx}. {name} ({lender})" if lender else f"{idx}. {name}")
    return "\n".join(lines)


def _user_escalation_ack(*, notify_ok: bool, owner_set: bool) -> str:
    if notify_ok or not owner_set:
        return "Un asesor te contactara para resolver tus dudas de financiamiento."
    return (
        "Registramos tu consulta de financiamiento. "
        "Hubo un problema temporal al enviar la alerta; en breve te contactamos."
    )


def is_enganche_related_request(text: str) -> bool:
    """True si el usuario pregunta por enganche."""

    normalized = normalize_user_text(text)
    return bool(normalized and "enganche" in normalized)


def is_generic_down_payment_only_question(text: str) -> bool:
    """True si solo pregunta el enganche en general, sin calculo ni caso personalizado."""

    normalized = normalize_user_text(text)
    if not normalized or "enganche" not in normalized:
        return False
    if _CUSTOM_TERM_PLAZO_RE.search(normalized):
        return False
    return not any(term in normalized for term in _ENGANCHE_PERSONALIZED_CONTEXT_SUBSTR)


def resolve_down_payment_message(user_text: str) -> str | None:
    """Mensaje configurable de enganche (FAQ); solo si el usuario lo menciona y hay texto guardado."""

    if not is_enganche_related_request(user_text):
        return None
    raw = get_bot_settings().get("downPaymentMessage")
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def append_down_payment_faq_if_applicable(
    state: clientState,
    user_text: str | None = None,
) -> clientState:
    """Agrega el mensaje de enganche como FAQ si aplica; no duplica el ultimo assistant."""

    text = str(user_text or "").strip()
    if not text:
        last_user, _ = latest_human_ai_pair(state)
        text = last_user
    msg = resolve_down_payment_message(text)
    if not msg:
        return state
    _, last_ai = latest_human_ai_pair(state)
    if last_ai == msg:
        return state
    return append_assistant_message(state, msg)


def resolve_visit_incentive_message() -> str | None:
    """Mensaje configurable para incentivar visita a tienda; solo si hay texto guardado."""

    raw = get_bot_settings().get("visitIncentiveMessage")
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def append_visit_incentive_if_configured(state: clientState) -> clientState:
    """Agrega el incentivo de visita si esta configurado; no duplica el ultimo assistant."""

    msg = resolve_visit_incentive_message()
    if not msg:
        return state
    _, last_ai = latest_human_ai_pair(state)
    if last_ai == msg:
        return state
    return append_assistant_message(state, msg)


def handle_financing_detail_escalation(
    state: clientState,
    *,
    advisor_trigger: str | None = None,
    user_message: str | None = None,
) -> clientState:
    """Registra evento CRM, envia push al owner y desactiva el bot."""

    if _already_escalated(state):
        _app.info(
            "[financing_detail] skip_duplicate_push trigger=%s",
            advisor_trigger or "unspecified",
        )
        return state

    user_id = str(state.get("user_id", "")).strip() or "lead"
    platform = str(state.get("platform", "web")).strip() or "web"
    current_node = str(state.get("current_node", "")).strip()
    selected_car = str(state.get("selected_car", "")).strip()
    owner_user_id = str(state.get("owner_user_id", "")).strip()
    conversation_id = str(state.get("conversation_id", "")).strip()
    customer_info = _clean_customer_info(state.get("customer_info"))

    push_title, push_body = build_advisor_help_push_copy(state)

    _app.info(
        "[financing_detail] notify_start trigger=%s node=%s platform=%s owner_user_id_set=%s",
        advisor_trigger or "unspecified",
        current_node,
        platform,
        bool(owner_user_id),
    )

    push_event_to_backend(
        {
            "user_id": user_id,
            "platform": platform,
            "message": "Cliente necesita ayuda con financiamiento",
            "from": "system",
            "selected_car": selected_car,
            "customer_info": customer_info,
            "current_node": current_node,
        }
    )

    notify_ok = False
    if owner_user_id:
        try:
            notify_ok = bool(
                notify_advisor(
                    selected_car,
                    customer_info,
                    owner_user_id=owner_user_id,
                    financing_selection={},
                    promotion_selection={},
                    push_title=push_title,
                    push_body=push_body,
                    notification_kind="financing_detail_help",
                    conversation_id=conversation_id,
                )
            )
        except Exception:
            logger.exception(
                "[financing_detail] notify_advisor_exception user_id=%s owner_user_id=%s",
                user_id,
                owner_user_id[:8] + "..." if len(owner_user_id) > 8 else owner_user_id,
            )
            notify_ok = False
    else:
        notify_ok = True

    state["financing_detail_push_sent"] = True
    user_text = str(user_message or "").strip()
    if not user_text:
        last_user, _ = latest_human_ai_pair(state)
        user_text = last_user
    state = append_down_payment_faq_if_applicable(state, user_text)
    state = append_visit_incentive_if_configured(state)
    ack = _user_escalation_ack(notify_ok=notify_ok, owner_set=bool(owner_user_id))
    state = append_assistant_message(state, ack)
    return deactivate_bot(state, reason="financing_detail")


def maybe_escalate_financing_detail(
    state: clientState,
    *,
    trigger: str,
    user_message: str | None = None,
    previous_bot_message: str | None = None,
    apply_catalog_request_skip: bool = True,
) -> clientState | None:
    """Clasificador LLM primero; heurísticas solo como respaldo. None si continúa el flujo."""

    if _already_escalated(state):
        return None

    last_user, last_ai = latest_human_ai_pair(state)
    user_text = str(user_message if user_message is not None else last_user or "").strip()
    if not user_text:
        return None

    # "Cotizar el Swift" / interes por modelo sin terminos de credito: flujo de catalogo.
    if is_vehicle_quote_without_financing_context(user_text):
        _app.info(
            "[financing_detail] skip_vehicle_quote_without_financing trigger=%s text_preview=%r",
            trigger,
            user_text[:80],
        )
        return None

    # Enganche generico (sin calculo ni caso propio) con mensaje publicado configurado:
    # lo responde el bot con el downPaymentMessage, no un asesor.
    if is_generic_down_payment_only_question(user_text) and resolve_down_payment_message(user_text):
        _app.info(
            "[financing_detail] skip_generic_down_payment_question trigger=%s text_preview=%r",
            trigger,
            user_text[:80],
        )
        return None

    bot_text = str(
        previous_bot_message
        if previous_bot_message is not None
        else last_ai or state.get("last_bot_message", "")
    ).strip()

    requires_advisor = classify_financing_detail_escalation(
        current_node=str(state.get("current_node", "")).strip(),
        previous_bot_message=bot_text,
        user_message=user_text,
        selected_vehicle_name=str(state.get("selected_car", "")).strip(),
        selected_plan_name=str(state.get("selected_financing_plan_name", "")).strip(),
        numbered_plan_lines=_numbered_plan_lines(state),
    )
    # Catalogo claro sin cotizacion/plazo a la medida: no escalar aunque el LLM diga true.
    catalog_skip = apply_catalog_request_skip and is_financing_catalog_request(user_text)
    if requires_advisor and catalog_skip:
        _app.info(
            "[financing_detail] override_llm_true_catalog_request trigger=%s text_preview=%r",
            trigger,
            user_text[:80],
        )
        return None
    if requires_advisor:
        _app.info(
            "[financing_detail] escalation trigger=%s node=%s source=llm",
            trigger,
            state.get("current_node"),
        )
        return handle_financing_detail_escalation(
            state,
            advisor_trigger=trigger,
            user_message=user_text,
        )

    if is_financing_personalized_quote_request(user_text):
        _app.info(
            "[financing_detail] personalized_quote_escalation trigger=%s text_preview=%r",
            trigger,
            user_text[:80],
        )
        return handle_financing_detail_escalation(
            state,
            advisor_trigger=trigger,
            user_message=user_text,
        )

    if catalog_skip:
        _app.info(
            "[financing_detail] skip_catalog_request_after_llm trigger=%s text_preview=%r",
            trigger,
            user_text[:80],
        )
        return None

    return None
