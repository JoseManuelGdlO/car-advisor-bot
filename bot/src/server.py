"""Servidor FastAPI para el bot asesor de carros."""

from __future__ import annotations

import logging
import os
from typing import Any

from dotenv import load_dotenv

load_dotenv()

from src.utils.app_logging import get_app_logger, setup_app_logging, uvicorn_log_level_str

setup_app_logging()

_server_log = get_app_logger("server")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from src.graph import build_graph
from src.context.tenant_context import reset_owner_user_id, set_owner_user_id
from src.utils.state_helpers import clear_onboarding_resume
from src.tools.database import (
    delete_bot_session,
    fetch_active_bot_session,
    push_assistant_message_to_backend,
    set_conversation_human_controlled,
    upsert_inbound_user_message,
    upsert_bot_session_state,
)

app = FastAPI(title="Car Advisor Bot API", version="0.1.0")
graph = build_graph()
logger = logging.getLogger(__name__)
ALLOWED_PLATFORMS = {"web", "whatsapp", "telegram", "facebook", "instagram", "api"}
MAX_MESSAGES_HISTORY = 50
BOT_MESSAGE_SEPARATOR = "\n\n<<BOT_MSG_BREAK>>\n\n"
_default_platform_candidate = (os.getenv("BOT_DEFAULT_INBOUND_CHANNEL", "web") or "web").strip().lower()
DEFAULT_INBOUND_PLATFORM = _default_platform_candidate if _default_platform_candidate in ALLOWED_PLATFORMS else "web"

raw_cors_origins = os.getenv("CORS_ORIGINS") or os.getenv("CORS_ORIGIN") or ""
allowed_cors_origins = [origin.strip() for origin in raw_cors_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    """Payload esperado por el endpoint `/chat`."""

    user_id: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    platform: str = Field(default=DEFAULT_INBOUND_PLATFORM)
    persist_to_backend: bool = Field(default=True)
    owner_user_id: str | None = None
    conversation_id: str | None = None

    @field_validator("user_id", "message")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        """Elimina espacios y valida que el texto no quede vacio."""

        normalized = value.strip()
        if not normalized:
            raise ValueError("El campo no puede estar vacio.")
        return normalized

    @field_validator("platform")
    @classmethod
    def normalize_platform(cls, value: str) -> str:
        """Normaliza y valida la plataforma de origen."""

        normalized = value.strip().lower()
        if normalized not in ALLOWED_PLATFORMS:
            raise ValueError(
                "Plataforma invalida. Usa: web, whatsapp, telegram, facebook, instagram o api."
            )
        return normalized


class ChatResponse(BaseModel):
    """Contrato de salida para frontend."""

    reply: str
    current_node: str
    selected_car: str
    financing_plan: str
    promotion: str
    bot_suppressed: bool = False


class SessionControlRequest(BaseModel):
    """Sincroniza `bot_disabled` en sesion sin invocar el grafo (handoff desde CRM)."""

    user_id: str = Field(..., min_length=1, max_length=255)
    platform: str = Field(default=DEFAULT_INBOUND_PLATFORM)
    bot_disabled: bool

    @field_validator("user_id")
    @classmethod
    def strip_user_id_session(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("El campo no puede estar vacio.")
        return normalized

    @field_validator("platform")
    @classmethod
    def normalize_platform_session(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in ALLOWED_PLATFORMS:
            raise ValueError(
                "Plataforma invalida. Usa: web, whatsapp, telegram, facebook, instagram o api."
            )
        return normalized


class SessionControlResponse(BaseModel):
    ok: bool
    bot_disabled: bool


class ResetRequest(BaseModel):
    """Payload para reiniciar sesión del bot (estado en `bot_sessions`)."""

    user_id: str = Field(..., min_length=1, max_length=255)
    platform: str = Field(default=DEFAULT_INBOUND_PLATFORM)

    @field_validator("user_id")
    @classmethod
    def strip_user_id(cls, value: str) -> str:
        """Recorta espacios del campo antes de validarlo (user id)."""
        normalized = value.strip()
        if not normalized:
            raise ValueError("El campo no puede estar vacio.")
        return normalized

    @field_validator("platform")
    @classmethod
    def normalize_platform_reset(cls, value: str) -> str:
        """Normaliza platform reset para mantener consistencia."""
        normalized = value.strip().lower()
        if normalized not in ALLOWED_PLATFORMS:
            raise ValueError(
                "Plataforma invalida. Usa: web, whatsapp, telegram, facebook, instagram o api."
            )
        return normalized


class ResetResponse(BaseModel):
    """Respuesta del reinicio de sesión."""

    status: str
    user_id: str
    platform: str
    deleted_rows: int


def _build_initial_state() -> dict[str, Any]:
    """Genera un estado inicial consistente para conversaciones nuevas."""

    return {
        "messages": [],
        "current_node": "start",
        "intent": "",
        "selected_car": "",
        "selected_vehicle_id": "",
        "customer_info": {},
        "last_vehicle_candidates": [],
        "last_bot_message": "",
        "skip_car_prompt": False,
        "skip_lead_prompt": False,
        "resume_to_step": "",
        "is_faq_interrupt": False,
        "awaiting_purchase_confirmation": False,
        "platform": DEFAULT_INBOUND_PLATFORM,
        "user_id": "",
        "lead_capture_done": False,
        "vehicle_images_cursor": 0,
        "vehicle_images_has_more": False,
        "vehicle_images_last_batch": [],
        "selected_financing_plan_id": "",
        "selected_financing_plan_name": "",
        "selected_financing_plan_lender": "",
        "financing_plan_candidates": [],
        "financing_vehicle_candidates": [],
        "awaiting_financing_plan_selection": False,
        "awaiting_financing_vehicle_selection": False,
        "selected_promotion_id": "",
        "selected_promotion_title": "",
        "selected_promotion_description": "",
        "selected_promotion_valid_until": "",
        "selected_promotion_vehicle_ids": [],
        "promotion_candidates": [],
        "promotion_vehicle_candidates": [],
        "awaiting_promotion_selection": False,
        "awaiting_promotion_vehicle_selection": False,
        "awaiting_promotion_vehicle_interest_confirmation": False,
        "awaiting_promotion_apply_confirmation": False,
        "pending_financing_after_promotion": False,
        "vehicle_comparison_ctx": {},
        "owner_user_id": "",
        "human_advisor_requested": False,
        "human_advisor_push_sent": False,
        "financing_detail_push_sent": False,
        "display_phone": "",
        "last_faq_interrupt_topic": "",
        "financing_interrupt_snapshot": {},
        "financing_credit_followup_pending": False,
        "suppress_commercial_node_once": False,
        "conversation_id": "",
        "bot_disabled": False,
        "awaiting_customer_name": False,
        "onboarding_greeting_done": False,
        "onboarding_turn_complete": False,
        "pending_onboarding_user_message": "",
        "onboarding_resume_user_message": "",
        "onboarding_welcome_sent_this_turn": False,
    }


def _suppressed_chat_response(state: dict[str, Any]) -> ChatResponse:
    """Respuesta vacia cuando el bot no debe contestar en este turno."""

    return ChatResponse(
        reply="",
        current_node=str(state.get("current_node", "start")),
        selected_car=str(state.get("selected_car", "")),
        financing_plan=str(state.get("selected_financing_plan_name", "")),
        promotion=str(state.get("selected_promotion_title", "")),
        bot_suppressed=True,
    )


def _collect_tail_ai_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Retorna mensajes de asistente consecutivos al final del historial."""

    collected: list[dict[str, Any]] = []
    for message in reversed(messages):
        if message.get("role") != "assistant":
            break
        collected.append(message)
    collected.reverse()
    return collected


def _resolve_chat_owner(payload: ChatRequest, state: dict[str, Any]) -> str:
    """Prioridad: body > state cargado > BOT_CRM_OWNER_USER_ID (dev)."""

    from_body = str(payload.owner_user_id or "").strip()
    if from_body:
        return from_body
    from_state = str(state.get("owner_user_id", "")).strip()
    if from_state:
        return from_state
    return str(os.getenv("BOT_CRM_OWNER_USER_ID", "")).strip()


_GENERIC_CLIENT_NAMES = frozenset({"cliente", "client", ""})


def _is_real_customer_name(name: str) -> bool:
    cleaned = str(name or "").strip()
    return len(cleaned) >= 2 and cleaned.lower() not in _GENERIC_CLIENT_NAMES


def _hydrate_customer_info_from_crm(state: dict[str, Any], crm: dict[str, Any] | None) -> None:
    """Completa customer_info.nombre desde el lead CRM si la sesion no lo trae."""

    if not crm:
        return
    info = dict(state.get("customer_info") or {})
    if _is_real_customer_name(str(info.get("nombre", ""))):
        state["customer_info"] = info
    else:
        crm_info = crm.get("customer_info")
        if isinstance(crm_info, dict):
            nombre = str(crm_info.get("nombre", "")).strip()
            if _is_real_customer_name(nombre):
                info["nombre"] = nombre
                state["customer_info"] = info
        else:
            client_name = str(crm.get("client_name", "")).strip()
            if _is_real_customer_name(client_name):
                info["nombre"] = client_name
                state["customer_info"] = info

    display_phone = str(crm.get("client_display_phone", "")).strip()
    if display_phone:
        state["display_phone"] = display_phone


def _customer_info_for_backend(state: dict[str, Any]) -> dict[str, Any] | None:
    info = state.get("customer_info")
    if not isinstance(info, dict):
        return None
    nombre = str(info.get("nombre", "")).strip()
    if not _is_real_customer_name(nombre):
        return None
    return {"nombre": nombre}


@app.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    """Procesa un turno de chat y devuelve mensaje + opciones de UI."""

    owner_token = None
    try:
        # 1) Estado del grafo + conversacion ya vinculada en `bot_sessions`, si existe.
        loaded_state, conv_from_session = fetch_active_bot_session(payload.user_id, payload.platform)
        state = loaded_state or _build_initial_state()
        state["platform"] = payload.platform
        state["user_id"] = payload.user_id
        conversation_id = str(payload.conversation_id or "").strip() or conv_from_session

        resolved_owner = _resolve_chat_owner(payload, state)
        if payload.persist_to_backend and not resolved_owner:
            raise HTTPException(
                status_code=400,
                detail="owner_user_id is required when persist_to_backend is true",
            )

        # Silencio total: sin persistir en grafo ni invocar LLM cuando la sesion esta apagada.
        if state.get("bot_disabled"):
            if payload.persist_to_backend:
                crm_early = upsert_inbound_user_message(
                    payload.user_id,
                    payload.message,
                    payload.platform,
                    owner_user_id=resolved_owner or None,
                )
                if crm_early:
                    conversation_id = crm_early["conversation_id"]
                    crm_owner = str(crm_early.get("owner_user_id", "")).strip()
                    if crm_owner:
                        resolved_owner = crm_owner
                if resolved_owner:
                    state["owner_user_id"] = resolved_owner
                    owner_token = set_owner_user_id(resolved_owner)
                if conversation_id:
                    state["conversation_id"] = conversation_id
                upsert_bot_session_state(
                    payload.user_id,
                    state,
                    platform=payload.platform,
                    conversation_id=conversation_id,
                )
            return _suppressed_chat_response(state)

        # 2) Registrar mensaje entrante en backend CRM y obtener IDs de relacion.
        crm = (
            upsert_inbound_user_message(
                payload.user_id,
                payload.message,
                payload.platform,
                owner_user_id=resolved_owner or None,
            )
            if payload.persist_to_backend
            else None
        )
        if crm:
            conversation_id = crm["conversation_id"]
            crm_owner = str(crm.get("owner_user_id", "")).strip()
            if crm_owner:
                resolved_owner = crm_owner
        _hydrate_customer_info_from_crm(state, crm)
        if resolved_owner:
            state["owner_user_id"] = resolved_owner
            owner_token = set_owner_user_id(resolved_owner)
        if conversation_id:
            state["conversation_id"] = conversation_id

        if crm and crm.get("should_auto_reply") is False:
            upsert_bot_session_state(
                payload.user_id,
                state,
                platform=payload.platform,
                conversation_id=conversation_id,
            )
            return _suppressed_chat_response(state)

        messages = list(state.get("messages", []))
        messages.append({"role": "user", "content": payload.message, "type": "HumanMessage"})
        # Evita crecimiento ilimitado del estado persistido.
        state["messages"] = messages[-MAX_MESSAGES_HISTORY:]
        previous_len = len(state["messages"])

        updated_state = graph.invoke(state)
        clear_onboarding_resume(updated_state)
        updated_messages = list(updated_state.get("messages", []))

        # Capa 2: persistir mensajes assistant en backend (fuente de verdad).
        if payload.persist_to_backend:
            try:
                customer_info_payload = _customer_info_for_backend(updated_state)
                for message in updated_messages[previous_len:]:
                    if message.get("role") == "assistant":
                        push_assistant_message_to_backend(
                            payload.user_id,
                            str(message.get("content", "")),
                            platform=payload.platform,
                            customer_info=customer_info_payload,
                        )
            except Exception:
                logger.exception("No se pudo persistir mensaje assistant en backend")

        upsert_bot_session_state(
            payload.user_id,
            updated_state,
            platform=payload.platform,
            conversation_id=conversation_id,
        )

        tail_ai_messages = _collect_tail_ai_messages(updated_messages)
        reply = BOT_MESSAGE_SEPARATOR.join(
            str(message.get("content", "")).strip()
            for message in tail_ai_messages
            if str(message.get("content", "")).strip()
        )
        if not reply:
            reply = "No pude generar una respuesta en este turno."

        return ChatResponse(
            reply=reply,
            current_node=str(updated_state.get("current_node", "router")),
            selected_car=str(updated_state.get("selected_car", "")),
            financing_plan=str(updated_state.get("selected_financing_plan_name", "")),
            promotion=str(updated_state.get("selected_promotion_title", "")),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error procesando /chat")
        raise HTTPException(status_code=500, detail="Error interno procesando chat.") from exc
    finally:
        reset_owner_user_id(owner_token)


@app.post("/session-control", response_model=SessionControlResponse)
def session_control(payload: SessionControlRequest) -> SessionControlResponse:
    """Marca la sesion como bot_disabled sin procesar mensajes (sync desde CRM)."""

    try:
        loaded_state, conv_from_session = fetch_active_bot_session(payload.user_id, payload.platform)
        state = loaded_state or _build_initial_state()
        state["platform"] = payload.platform
        state["user_id"] = payload.user_id
        state["bot_disabled"] = payload.bot_disabled
        if conv_from_session:
            state["conversation_id"] = conv_from_session
        upsert_bot_session_state(
            payload.user_id,
            state,
            platform=payload.platform,
            conversation_id=conv_from_session,
        )
        return SessionControlResponse(ok=True, bot_disabled=payload.bot_disabled)
    except Exception as exc:
        logger.exception("Error procesando /session-control")
        raise HTTPException(status_code=500, detail="Error interno al actualizar sesion.") from exc


@app.post("/reset", response_model=ResetResponse)
def reset_session(payload: ResetRequest) -> ResetResponse:
    """Elimina la sesión persistida para que el próximo mensaje arranque desde cero."""

    if _server_log.isEnabledFor(logging.DEBUG):
        _server_log.debug(
            "[RESET] POST /reset user_id=%r platform=%r",
            payload.user_id,
            payload.platform,
        )
    else:
        _server_log.info("[RESET] POST /reset platform=%r", payload.platform,)
    try:
        loaded_state, conv_from_session = fetch_active_bot_session(
            payload.user_id,
            payload.platform,
        )
        conversation_id = conv_from_session
        if not conversation_id and loaded_state:
            conversation_id = str(loaded_state.get("conversation_id", "")).strip() or None
        owner_user_id = None
        if loaded_state:
            owner_user_id = str(loaded_state.get("owner_user_id", "")).strip() or None
        if not owner_user_id:
            owner_user_id = str(os.getenv("BOT_CRM_OWNER_USER_ID", "")).strip() or None
        if conversation_id:
            released = set_conversation_human_controlled(
                conversation_id,
                is_human_controlled=False,
                owner_user_id=owner_user_id,
            )
            _server_log.info(
                "[RESET] release_human_control conversation_id=%s released=%s",
                conversation_id,
                released,
            )
        deleted = delete_bot_session(payload.user_id, payload.platform)
        _server_log.info("[RESET] delete_bot_session deleted_rows=%s", deleted)
        return ResetResponse(
            status="session reset",
            user_id=payload.user_id,
            platform=payload.platform,
            deleted_rows=deleted,
        )
    except Exception as exc:
        logger.exception("Error procesando /reset")
        raise HTTPException(status_code=500, detail="Error interno al reiniciar sesion.") from exc


@app.get("/health")
def health() -> dict[str, str]:
    """Health-check basico del servicio."""

    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("API_PORT", 8000))
    host = os.getenv("API_HOST", "0.0.0.0")
    print(f"Starting server on {host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level=uvicorn_log_level_str())
