"""Utilidades de persistencia de sesion en MySQL para el bot."""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import mysql.connector
import requests
from mysql.connector.connection import MySQLConnection
from mysql.connector.errors import Error as MySQLError


def _normalize_uuid(value: Any) -> str | None:
    """Convierte UUID devuelto por MySQL (str/bytes/...) a string estandar."""

    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8")
    text = str(value).strip()
    return text or None


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


def _is_missing_table_error(exc: Exception) -> bool:
    """Detecta errores de tabla inexistente en MySQL (1146)."""

    return isinstance(exc, MySQLError) and getattr(exc, "errno", None) == 1146


def fetch_active_bot_session(phone: str, platform: str = "web") -> tuple[dict[str, Any] | None, str | None]:
    """Recupera sesion activa: estado del grafo y `conversation_id` del CRM.

    Retorna `(estado, conversation_id)` o `(None, None)` si no hay fila activa.
    El `conversation_id` viene de la columna homonima (no del JSON interno),
    para enlazar `messages` y `bot_sessions` sin pasar datos por el grafo.
    """

    connection = get_connection()
    try:
        query = """
            SELECT conversation_id, state_payload
            FROM bot_sessions
            WHERE phone = %s
              AND platform = %s
              AND expires_at > UTC_TIMESTAMP()
            ORDER BY expires_at DESC
            LIMIT 1
        """
        with connection.cursor() as cursor:
            cursor.execute(query, (phone, platform))
            row = cursor.fetchone()
            if not row:
                return (None, None)

            conv_raw, payload = row[0], row[1]
            conversation_id = _normalize_uuid(conv_raw)
            if isinstance(payload, (dict, list)):
                return (payload, conversation_id)
            if isinstance(payload, str):
                return (json.loads(payload), conversation_id)
            return (None, conversation_id)
    except Exception as exc:
        # Permite operar sin persistencia si la tabla aun no fue creada.
        if _is_missing_table_error(exc):
            return (None, None)
        raise
    finally:
        connection.close()


def ensure_crm_conversation(phone: str, platform: str = "web") -> dict[str, str] | None:
    """Garantiza lead+conversacion en el backend antes de escribir `messages`.

    POST a `/bot/conversation-events` con `message` vacio: el controlador
    hace findOrCreate sin insertar fila en `messages` (solo actualiza lead),
    pero devuelve `conversationId` y `ownerUserId` necesarios para el INSERT
    directo desde el bot hacia MySQL.
    """

    url = _backend_api_url("/bot/conversation-events")
    headers = _backend_headers()
    if not url or "Authorization" not in headers:
        return None
    try:
        response = requests.post(
            url,
            json={
                "user_id": phone,
                "platform": platform,
                "message": "",
                "selected_car": "",
                "customer_info": {},
            },
            headers=headers,
            timeout=8,
        )
        if response.status_code != 201:
            return None
        data = response.json()
        conv = _normalize_uuid(data.get("conversationId"))
        owner = _normalize_uuid(data.get("ownerUserId"))
        if not conv or not owner:
            return None
        return {"conversation_id": conv, "owner_user_id": owner}
    except Exception:
        return None


def upsert_bot_session_state(
    phone: str,
    state_dict: dict[str, Any],
    platform: str = "web",
    conversation_id: str | None = None,
    payload_version: int = 1,
) -> None:
    """Inserta o actualiza el estado serializado del usuario en `bot_sessions`.

    Requiere un indice unico por (`phone`, `platform`) para que
    `ON DUPLICATE KEY UPDATE` funcione correctamente.
    """

    connection = get_connection()
    try:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        state_payload_json = json.dumps(state_dict, ensure_ascii=True)
        query = """
            INSERT INTO bot_sessions (
                session_id,
                phone,
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
                    phone,
                    platform,
                    conversation_id,
                    state_payload_json,
                    payload_version,
                    expires_at.replace(tzinfo=None),
                ),
            )
        connection.commit()
    except Exception as exc:
        # Evita romper el flujo del chat si falta tabla de sesion.
        if _is_missing_table_error(exc):
            return
        raise
    finally:
        connection.close()


def save_message(
    phone: str,
    role: str,
    content: str,
    platform: str = "web",
    conversation_id: str | None = None,
    owner_user_id: str | None = None,
) -> None:
    """Guarda historial/auditoria en tabla `messages`.

    Requiere `conversation_id` y `owner_user_id` validos (mismo CRM que el
    backend); si faltan, se omite el INSERT para no violar NOT NULL/FK.
    Igual se envia el evento HTTP al CRM (mismo contrato que antes).
    """

    connection = get_connection()
    try:
        # Sin claves de negocio no intentamos INSERT: el esquema las exige.
        if conversation_id and owner_user_id:
            time_label = datetime.now().strftime("%H:%M")
            query = """
                INSERT INTO messages (
                    id,
                    owner_user_id,
                    phone,
                    platform,
                    conversation_id,
                    `from`,
                    text,
                    time,
                    created_at,
                    updated_at
                )
                VALUES (UUID(), %s, %s, %s, %s, %s, %s, %s, UTC_TIMESTAMP(), UTC_TIMESTAMP())
            """
            with connection.cursor() as cursor:
                cursor.execute(
                    query,
                    (
                        owner_user_id,
                        phone,
                        platform,
                        conversation_id,
                        role,
                        content,
                        time_label,
                    ),
                )
            connection.commit()
    except Exception as exc:
        # Historial es opcional; no tumbar chat por tabla ausente.
        if _is_missing_table_error(exc):
            return
        raise
    finally:
        connection.close()

    push_event_to_backend(
        {
            "user_id": phone,
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
