"""Escalacion: usuario pide hablar con asesor humano (push + evento CRM)."""

from __future__ import annotations

import logging
from typing import Any

from src.state import clientState
from src.tools.database import push_event_to_backend
from src.tools.vehicles import normalize_user_text, notify_advisor
from src.utils.app_logging import get_app_logger
from src.utils.bot_control import deactivate_bot
from src.utils.signals import HUMAN_ADVISOR_HEURISTIC_SUBSTR
from src.utils.state_helpers import append_assistant_message, latest_user_message

logger = logging.getLogger(__name__)
_app = get_app_logger("human_advisor")


def human_advisor_heuristic_match(user_text: str) -> str | None:
    """Si la heuristica dispara, devuelve la subcadena normalizada que hizo match (para logs)."""

    n = normalize_user_text(user_text)
    if not n:
        return None
    for s in sorted(HUMAN_ADVISOR_HEURISTIC_SUBSTR, key=len, reverse=True):
        if s in n:
            return s
    return None


def _clean_customer_info(info: Any) -> dict[str, str]:
    if not isinstance(info, dict):
        return {}
    out: dict[str, str] = {}
    for k in ("nombre", "telefono", "email"):
        v = info.get(k)
        if v is not None and str(v).strip():
            out[k] = str(v).strip()
    return out


def _has_complete_customer_info(state: clientState) -> bool:
    info = _clean_customer_info(state.get("customer_info"))
    return bool(info.get("nombre") and info.get("telefono") and info.get("email"))


def _user_handoff_ack(
    state: clientState,
    *,
    notify_ok: bool,
    prior_advisor_contact: bool = False,
) -> str:
    """Mensaje de cierre al usuario segun datos capturados y resultado del push."""

    owner_set = bool(str(state.get("owner_user_id", "")).strip())
    data_complete = _has_complete_customer_info(state) or bool(state.get("lead_capture_done"))

    if data_complete:
        if notify_ok or not owner_set:
            return "Listo, ya registramos tu solicitud. En breve te contactamos."
        return (
            "Registramos tu solicitud. "
            "Hubo un problema temporal al enviar la alerta; en breve te contactamos."
        )

    if notify_ok or not owner_set:
        if prior_advisor_contact:
            return "Listo, ya avise para que te contacten otra vez."
        return "Listo, ya avise para que te contacten."
    if prior_advisor_contact:
        return (
            "Registramos tu solicitud de hablar con un asesor. "
            "Hubo un problema temporal en breve te contactan otra vez."
        )
    return (
        "Registramos tu solicitud de hablar con un asesor. "
        "Hubo un problema temporal en breve te contactan."
    )


def _human_advisor_push_copy(
    *,
    customer_name: str,
    customer_phone: str,
    selected_car: str,
    platform: str,
    current_node: str,
) -> tuple[str, str]:
    title = "Solicitud de asesor humano"
    parts = [
        "El usuario solicito hablar con un asesor.",
        f"Plataforma: {platform or 'N/D'}.",
        f"Nodo: {current_node or 'N/D'}.",
    ]
    if customer_name:
        parts.append(f"Cliente: {customer_name}.")
    if customer_phone:
        parts.append(f"Telefono: {customer_phone}.")
    if selected_car:
        parts.append(f"Vehiculo de interes: {selected_car}.")
    body = " ".join(parts)
    return title, body


def handle_human_advisor_request(
    state: clientState,
    *,
    advisor_trigger: str | None = None,
) -> clientState:
    """Registra evento CRM, envia push al owner (si aplica) y agrega mensaje de cierre al usuario.

    Idempotente por conversacion usando `human_advisor_push_sent`.
    """

    if state.get("human_advisor_push_sent"):
        _app.info(
            "[human_advisor] skip_duplicate_push trigger=%s",
            advisor_trigger or "unspecified",
        )
        _app.debug(
            "[human_advisor] skip_duplicate_push_detail user_id=%s",
            str(state.get("user_id", "")).strip() or "lead",
        )
        return state

    user_id = str(state.get("user_id", "")).strip() or "lead"
    platform = str(state.get("platform", "web")).strip() or "web"
    current_node = str(state.get("current_node", "")).strip()
    selected_car = str(state.get("selected_car", "")).strip()
    owner_user_id = str(state.get("owner_user_id", "")).strip()
    customer_info = _clean_customer_info(state.get("customer_info"))
    customer_name = customer_info.get("nombre", "")
    customer_phone = customer_info.get("telefono", "")

    push_title, push_body = _human_advisor_push_copy(
        customer_name=customer_name,
        customer_phone=customer_phone,
        selected_car=selected_car,
        platform=platform,
        current_node=current_node,
    )

    _app.info(
        "[human_advisor] notify_start trigger=%s node=%s platform=%s owner_user_id_set=%s",
        advisor_trigger or "unspecified",
        current_node,
        platform,
        bool(owner_user_id),
    )
    _app.debug(
        "[human_advisor] notify_start_detail user_id=%s selected_car=%r customer_phone_set=%s",
        user_id,
        selected_car,
        bool(customer_phone),
    )

    push_event_to_backend(
        {
            "user_id": user_id,
            "platform": platform,
            "message": "human_advisor_requested",
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
                    notification_kind="human_advisor",
                )
            )
        except Exception:
            logger.exception(
                "[human_advisor] notify_advisor_exception user_id=%s owner_user_id=%s",
                user_id,
                owner_user_id[:8] + "..." if len(owner_user_id) > 8 else owner_user_id,
            )
            notify_ok = False
    else:
        notify_ok = True

    _app.info(
        "[human_advisor] notify_done trigger=%s notify_ok=%s owner_user_id_set=%s",
        advisor_trigger or "unspecified",
        notify_ok,
        bool(owner_user_id),
    )
    _app.debug("[human_advisor] notify_done_detail user_id=%s notify_ok=%s owner_user_id_set=%s", user_id, notify_ok, bool(owner_user_id))

    prior_advisor_contact = bool(state.get("human_advisor_requested")) or bool(state.get("lead_capture_done"))

    state["human_advisor_requested"] = True
    state["human_advisor_push_sent"] = True

    ack = _user_handoff_ack(state, notify_ok=notify_ok, prior_advisor_contact=prior_advisor_contact)
    state = append_assistant_message(state, ack)
    return deactivate_bot(state, reason="human_advisor")
