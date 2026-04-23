"""Servidor FastAPI para el bot asesor de carros."""

from __future__ import annotations

import logging
import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from src.graph import build_graph
from src.tools.database import (
    delete_bot_session,
    fetch_active_bot_session,
    push_assistant_message_to_backend,
    upsert_inbound_user_message,
    upsert_bot_session_state,
)

load_dotenv()

app = FastAPI(title="Car Advisor Bot API", version="0.1.0")
graph = build_graph()
logger = logging.getLogger(__name__)
ALLOWED_PLATFORMS = {"web", "whatsapp", "telegram", "facebook", "api"}
MAX_MESSAGES_HISTORY = 50
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
                "Plataforma invalida. Usa: web, whatsapp, telegram, facebook o api."
            )
        return normalized


class ChatResponse(BaseModel):
    """Contrato de salida para frontend."""

    reply: str
    current_node: str
    selected_car: str


class ResetRequest(BaseModel):
    """Payload para reiniciar sesión del bot (estado en `bot_sessions`)."""

    user_id: str = Field(..., min_length=1, max_length=255)
    platform: str = Field(default=DEFAULT_INBOUND_PLATFORM)

    @field_validator("user_id")
    @classmethod
    def strip_user_id(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("El campo no puede estar vacio.")
        return normalized

    @field_validator("platform")
    @classmethod
    def normalize_platform_reset(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in ALLOWED_PLATFORMS:
            raise ValueError(
                "Plataforma invalida. Usa: web, whatsapp, telegram, facebook o api."
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
    }


def _collect_tail_ai_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Retorna mensajes de asistente consecutivos al final del historial."""

    collected: list[dict[str, Any]] = []
    for message in reversed(messages):
        if message.get("role") != "assistant":
            break
        collected.append(message)
    collected.reverse()
    return collected


@app.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    """Procesa un turno de chat y devuelve mensaje + opciones de UI."""

    try:
        # 1) Estado del grafo + conversacion ya vinculada en `bot_sessions`, si existe.
        loaded_state, conv_from_session = fetch_active_bot_session(payload.user_id, payload.platform)
        state = loaded_state or _build_initial_state()
        state["platform"] = payload.platform
        # 2) Registrar mensaje entrante en backend CRM y obtener IDs de relacion.
        conversation_id = conv_from_session
        crm = upsert_inbound_user_message(payload.user_id, payload.message, payload.platform)
        if crm:
            conversation_id = crm["conversation_id"]
        messages = list(state.get("messages", []))
        messages.append({"role": "user", "content": payload.message, "type": "HumanMessage"})
        # Evita crecimiento ilimitado del estado persistido.
        state["messages"] = messages[-MAX_MESSAGES_HISTORY:]
        previous_len = len(state["messages"])

        updated_state = graph.invoke(state)
        updated_messages = list(updated_state.get("messages", []))

        # Capa 2: persistir mensajes assistant en backend (fuente de verdad).
        try:
            for message in updated_messages[previous_len:]:
                if message.get("role") == "assistant":
                    push_assistant_message_to_backend(
                        payload.user_id,
                        str(message.get("content", "")),
                        platform=payload.platform,
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
        reply = "\n".join(
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
        )
    except Exception as exc:
        logger.exception("Error procesando /chat")
        raise HTTPException(status_code=500, detail="Error interno procesando chat.") from exc


@app.post("/reset", response_model=ResetResponse)
def reset_session(payload: ResetRequest) -> ResetResponse:
    """Elimina la sesión persistida para que el próximo mensaje arranque desde cero."""

    print(
        f"[RESET] POST /reset user_id={payload.user_id!r} platform={payload.platform!r}"
    )
    try:
        deleted = delete_bot_session(payload.user_id, payload.platform)
        print(f"[RESET] delete_bot_session deleted_rows={deleted}")
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
    uvicorn.run(app, host=host, port=port)
