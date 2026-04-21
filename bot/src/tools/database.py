"""Utilidades de persistencia de sesion en MySQL para el bot."""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import mysql.connector
import requests
from mysql.connector.connection import MySQLConnection


def _backend_headers() -> dict[str, str]:
    token = os.getenv("BACKEND_SERVICE_TOKEN", "").strip()
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"} if token else {}


def _backend_api_url(path: str) -> str:
    base = os.getenv("BACKEND_API_URL", "").rstrip("/")
    return f"{base}{path}" if base else ""


def push_event_to_backend(payload: dict[str, Any]) -> None:
    """Envia eventos del bot al backend Node cuando existe configuracion."""
    url = _backend_api_url("/bot/conversation-events")
    headers = _backend_headers()
    if not url or "Authorization" not in headers:
        return
    try:
        requests.post(url, json=payload, headers=headers, timeout=5)
    except Exception:
        return


def get_connection() -> MySQLConnection:
    """Retorna una conexion MySQL usando variables de entorno."""

    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", ""),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "car-advisor-bot"),
    )


def fetch_active_bot_session(user_id: str, platform: str = "web") -> dict[str, Any] | None:
    """Recupera sesion activa y deserializa `state_payload` desde `bot_sessions`.

    La consulta ignora `company_id` por requerimiento del MVP.
    """

    connection = get_connection()
    try:
        query = """
            SELECT state_payload
            FROM bot_sessions
            WHERE user_identifier = %s
              AND platform = %s
              AND expires_at > UTC_TIMESTAMP()
            ORDER BY expires_at DESC
            LIMIT 1
        """
        with connection.cursor() as cursor:
            cursor.execute(query, (user_id, platform))
            row = cursor.fetchone()
            if not row:
                return None

            payload = row[0]
            if isinstance(payload, (dict, list)):
                return payload
            if isinstance(payload, str):
                return json.loads(payload)
            return None
    finally:
        connection.close()


def upsert_bot_session_state(
    user_id: str,
    state_dict: dict[str, Any],
    platform: str = "web",
    conversation_id: str | None = None,
    payload_version: int = 1,
) -> None:
    """Inserta o actualiza el estado serializado del usuario en `bot_sessions`.

    Requiere un indice unico por (`user_identifier`, `platform`) para que
    `ON DUPLICATE KEY UPDATE` funcione correctamente.
    """

    connection = get_connection()
    try:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        state_payload_json = json.dumps(state_dict, ensure_ascii=True)
        query = """
            INSERT INTO bot_sessions (
                session_id,
                user_identifier,
                platform,
                conversation_id,
                state_payload,
                payload_version,
                expires_at
            )
            VALUES (UUID(), %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                conversation_id = VALUES(conversation_id),
                state_payload = VALUES(state_payload),
                payload_version = VALUES(payload_version),
                expires_at = VALUES(expires_at)
        """
        with connection.cursor() as cursor:
            cursor.execute(
                query,
                (
                    user_id,
                    platform,
                    conversation_id,
                    state_payload_json,
                    payload_version,
                    expires_at.replace(tzinfo=None),
                ),
            )
        connection.commit()
    finally:
        connection.close()


def save_message(
    user_id: str,
    role: str,
    content: str,
    platform: str = "web",
    conversation_id: str | None = None,
) -> None:
    """Guarda historial/auditoria en tabla `messages`.

    Nota: esta tabla no participa en las decisiones del grafo; el contexto
    operativo vive en `state_payload.messages`.
    """

    connection = get_connection()
    try:
        query = """
            INSERT INTO messages (
                id,
                user_identifier,
                platform,
                conversation_id,
                role,
                content,
                created_at
            )
            VALUES (UUID(), %s, %s, %s, %s, %s, UTC_TIMESTAMP())
        """
        with connection.cursor() as cursor:
            cursor.execute(query, (user_id, platform, conversation_id, role, content))
        connection.commit()
    finally:
        connection.close()

    push_event_to_backend(
        {
            "user_id": user_id,
            "platform": platform,
            "message": content,
            "selected_car": "",
            "customer_info": {"source_role": role},
        }
    )


def fetch_faq_candidates(question: str, limit: int = 3) -> list[str]:
    """Obtiene respuestas FAQ candidatas desde BD para preguntas generales."""

    if not question.strip():
        return []

    connection = get_connection()
    try:
        query = """
            SELECT answer
            FROM faqs
            WHERE question LIKE %s
            ORDER BY updated_at DESC
            LIMIT %s
        """
        like_term = f"%{question.strip()}%"
        with connection.cursor() as cursor:
            cursor.execute(query, (like_term, limit))
            rows = cursor.fetchall() or []
        return [str(row[0]).strip() for row in rows if row and row[0]]
    except Exception:
        # FAQ DB es opcional para el MVP.
        return []
    finally:
        connection.close()
