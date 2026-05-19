"""Control de activacion/desactivacion del bot por conversacion."""

from __future__ import annotations

from src.state import clientState
from src.tools.database import set_conversation_human_controlled
from src.utils.app_logging import get_app_logger

_app = get_app_logger("bot_control")


def deactivate_bot(
    state: clientState,
    *,
    conversation_id: str | None = None,
    reason: str = "handoff",
) -> clientState:
    """Desactiva el bot para la conversacion: bandera local + handoff CRM si aplica."""

    state["bot_disabled"] = True
    conv_id = (conversation_id or str(state.get("conversation_id", "")).strip() or None)
    crm_ok = False
    if conv_id:
        crm_ok = set_conversation_human_controlled(conv_id, is_human_controlled=True)
    _app.info(
        "[bot_control] deactivate_bot reason=%s conversation_id_set=%s crm_handoff=%s",
        reason,
        bool(conv_id),
        crm_ok,
    )
    return state
