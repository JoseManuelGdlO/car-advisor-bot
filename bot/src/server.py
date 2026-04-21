"""Servidor FastAPI para el bot asesor de carros."""

from __future__ import annotations

import logging
import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from src.graph import build_graph
from src.tools.database import (
    fetch_active_bot_session,
    save_message,
    upsert_bot_session_state,
)

load_dotenv()

app = FastAPI(title="Car Advisor Bot API", version="0.1.0")
graph = build_graph()
logger = logging.getLogger(__name__)
ALLOWED_PLATFORMS = {"web", "whatsapp", "telegram", "facebook", "api"}
MAX_MESSAGES_HISTORY = 50


class ChatRequest(BaseModel):
    """Payload esperado por el endpoint `/chat`."""

    user_id: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    platform: str = Field(default="web")

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
    options: list[str]
    current_node: str
    selected_category: str
    selected_car: str


def _build_initial_state() -> dict[str, Any]:
    """Genera un estado inicial consistente para conversaciones nuevas."""

    return {
        "messages": [],
        "current_node": "start",
        "selected_category": "",
        "selected_car": "",
        "customer_info": {},
        "last_bot_message": "",
        "options": [],
        "skip_category_prompt": False,
        "skip_car_prompt": False,
        "skip_lead_prompt": False,
        "resume_to_step": "",
        "is_faq_interrupt": False,
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
        state = fetch_active_bot_session(payload.user_id, payload.platform) or _build_initial_state()
        messages = list(state.get("messages", []))
        messages.append({"role": "user", "content": payload.message, "type": "HumanMessage"})
        # Evita crecimiento ilimitado del estado persistido.
        state["messages"] = messages[-MAX_MESSAGES_HISTORY:]
        previous_len = len(state["messages"])

        updated_state = graph.invoke(state)
        updated_messages = list(updated_state.get("messages", []))

        # Capa 2: auditoria en tabla `messages` (separada del contexto operativo).
        try:
            save_message(payload.user_id, "user", payload.message, platform=payload.platform)

            # Persiste solo los assistant nuevos generados en este turno.
            for message in updated_messages[previous_len:]:
                if message.get("role") == "assistant":
                    save_message(
                        payload.user_id,
                        "assistant",
                        str(message.get("content", "")),
                        platform=payload.platform,
                    )
        except Exception:
            logger.exception("No se pudo guardar historial en tabla messages")

        upsert_bot_session_state(payload.user_id, updated_state, platform=payload.platform)

        tail_ai_messages = _collect_tail_ai_messages(updated_messages)
        reply = "\n".join(
            str(message.get("content", "")).strip()
            for message in tail_ai_messages
            if str(message.get("content", "")).strip()
        )
        if not reply:
            reply = "No pude generar una respuesta en este turno."

        options: list[str] = []
        if tail_ai_messages:
            last_options = tail_ai_messages[-1].get("options", [])
            if isinstance(last_options, list):
                options = [str(option) for option in last_options]

        return ChatResponse(
            reply=reply,
            options=options or list(updated_state.get("options", [])),
            current_node=str(updated_state.get("current_node", "router")),
            selected_category=str(updated_state.get("selected_category", "")),
            selected_car=str(updated_state.get("selected_car", "")),
        )
    except Exception as exc:
        logger.exception("Error procesando /chat")
        raise HTTPException(status_code=500, detail="Error interno procesando chat.") from exc


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
