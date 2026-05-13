"""Escalacion: usuario pide hablar con asesor humano (push + evento CRM)."""

from __future__ import annotations

from typing import Any

from src.state import clientState
from src.tools.database import push_event_to_backend
from src.tools.vehicles import normalize_user_text, notify_advisor
from src.utils.signals import HUMAN_ADVISOR_HEURISTIC_SUBSTR
from src.utils.state_helpers import append_assistant_message, latest_user_message


def wants_human_advisor_heuristic(user_text: str) -> bool:
    """Deteccion rapida sin LLM para pedidos explicitos de contacto humano."""

    n = normalize_user_text(user_text)
    if not n:
        return False
    return any(s in n for s in HUMAN_ADVISOR_HEURISTIC_SUBSTR)


def _clean_customer_info(info: Any) -> dict[str, str]:
    if not isinstance(info, dict):
        return {}
    out: dict[str, str] = {}
    for k in ("nombre", "telefono", "email"):
        v = info.get(k)
        if v is not None and str(v).strip():
            out[k] = str(v).strip()
    return out


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


def handle_human_advisor_request(state: clientState) -> clientState:
    """Registra evento CRM, envia push al owner (si aplica) y agrega mensaje de cierre al usuario.

    Idempotente por conversacion usando `human_advisor_push_sent`.
    """

    if state.get("human_advisor_push_sent"):
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
            notify_ok = False
    else:
        notify_ok = True

    state["human_advisor_requested"] = True
    state["human_advisor_push_sent"] = True

    last_user = latest_user_message(state)
    if notify_ok or not owner_user_id:
        ack = (
            "Listo, ya avise a un asesor para que te contacte. "
            "Mientras tanto sigo aqui si necesitas algo mas sobre vehiculos o planes."
        )
    else:
        ack = (
            "Registre tu solicitud de hablar con un asesor. "
            "Hubo un problema temporal al enviar la alerta, pero un asesor puede ver tu conversacion en el sistema."
        )

    return append_assistant_message(state, ack)
