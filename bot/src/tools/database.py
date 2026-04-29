"""Utilidades de persistencia de sesion en MySQL para el bot."""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import mysql.connector
import requests
from mysql.connector.connection import MySQLConnection
from mysql.connector.errors import Error as MySQLError

logger = logging.getLogger(__name__)

DEFAULT_BOT_SETTINGS = {
    "tone": "cercano",
    "emojiStyle": "frecuentes",
    "salesProactivity": "alto",
    "customInstructions": "Eres una persona muy amable y autentica",
}


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


def _clean_setting(value: Any, default: str) -> str:
    """Normaliza setting remoto con fallback robusto ante null/None."""

    if value is None:
        return default
    text = str(value).strip()
    if not text:
        return default
    if text.lower() in {"none", "null", "undefined"}:
        return default
    return text


def get_bot_settings() -> dict[str, str]:
    """Obtiene bot settings desde backend con fallback seguro."""

    url = _backend_api_url("/bot/settings")
    headers = _backend_headers()
    if not url or "Authorization" not in headers:
        return dict(DEFAULT_BOT_SETTINGS)
    try:
        response = requests.get(url, headers=headers, timeout=6)
        if response.status_code != 200:
            logger.warning("Bot settings fetch failed status=%s", response.status_code)
            return dict(DEFAULT_BOT_SETTINGS)
        payload = response.json()
        if not isinstance(payload, dict):
            return dict(DEFAULT_BOT_SETTINGS)
        return {
            "tone": _clean_setting(payload.get("tone"), DEFAULT_BOT_SETTINGS["tone"]),
            "emojiStyle": _clean_setting(payload.get("emojiStyle"), DEFAULT_BOT_SETTINGS["emojiStyle"]),
            "salesProactivity": _clean_setting(
                payload.get("salesProactivity"),
                DEFAULT_BOT_SETTINGS["salesProactivity"],
            ),
            "customInstructions": _clean_setting(
                payload.get("customInstructions"),
                DEFAULT_BOT_SETTINGS["customInstructions"],
            ),
        }
    except Exception:
        logger.exception("Bot settings fetch failed unexpectedly")
        return dict(DEFAULT_BOT_SETTINGS)


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


def _normalize_financing_plans_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
        if isinstance(payload.get("rows"), list):
            return [item for item in payload["rows"] if isinstance(item, dict)]
    return []


def _normalize_promotions_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
        if isinstance(payload.get("rows"), list):
            return [item for item in payload["rows"] if isinstance(item, dict)]
    return []


def fetch_financing_plans() -> list[dict[str, Any]]:
    """Obtiene todos los planes de financiamiento disponibles del backend."""

    url = _backend_api_url("/financing-plans")
    headers = _backend_headers()
    if not url:
        return []
    response = requests.get(url, headers=headers, timeout=6)
    if response.status_code == 404:
        return []
    response.raise_for_status()
    return _normalize_financing_plans_payload(response.json())


def fetch_financing_plans_by_vehicle(vehicle_id: str) -> list[dict[str, Any]]:
    """Obtiene planes de financiamiento para un vehiculo puntual."""

    normalized_id = str(vehicle_id or "").strip()
    if not normalized_id:
        return []
    url = _backend_api_url(f"/vehicles/{normalized_id}/financing-plans")
    headers = _backend_headers()
    if not url:
        return []
    response = requests.get(url, headers=headers, timeout=6)
    if response.status_code == 404:
        return []
    response.raise_for_status()
    return _normalize_financing_plans_payload(response.json())


def fetch_promotions() -> list[dict[str, Any]]:
    """Obtiene todas las promociones disponibles del backend."""

    url = _backend_api_url("/promotions")
    headers = _backend_headers()
    if not url:
        return []
    response = requests.get(url, headers=headers, timeout=6)
    if response.status_code == 404:
        return []
    response.raise_for_status()
    return _normalize_promotions_payload(response.json())


def fetch_promotions_by_vehicle(vehicle_id: str) -> list[dict[str, Any]]:
    """Obtiene promociones asociadas a un vehiculo puntual."""

    normalized_id = str(vehicle_id or "").strip()
    if not normalized_id:
        return []
    url = _backend_api_url(f"/vehicles/{normalized_id}/promotions")
    headers = _backend_headers()
    if not url:
        return []
    response = requests.get(url, headers=headers, timeout=6)
    if response.status_code == 404:
        return []
    response.raise_for_status()
    return _normalize_promotions_payload(response.json())


def upsert_inbound_user_message(phone: str, message: str, platform: str = "web") -> dict[str, str] | None:
    """Registra mensaje entrante en backend y retorna IDs CRM normalizados."""

    normalized_phone = str(phone).strip()
    normalized_message = str(message).strip()
    default_platform = str(os.getenv("BOT_DEFAULT_INBOUND_CHANNEL", "web")).strip().lower() or "web"
    normalized_platform = str(platform or default_platform).strip().lower() or default_platform
    if not normalized_phone or not normalized_message:
        logger.warning("Skipping backend upsert: missing phone/message")
        return None

    url = _backend_api_url("/bot/conversation-events")
    headers = _backend_headers()
    if not url or "Authorization" not in headers:
        logger.error("Skipping backend upsert: BACKEND_API_URL or BACKEND_SERVICE_TOKEN missing")
        return None
    try:
        response = requests.post(
            url,
            json={
                "user_id": normalized_phone,
                "platform": normalized_platform,
                "message": normalized_message,
                "from": "client",
                "selected_car": "",
                "customer_info": {},
            },
            headers=headers,
            timeout=8,
        )
        if response.status_code != 201:
            logger.error(
                "Backend inbound upsert failed status=%s body=%s",
                response.status_code,
                response.text[:300],
            )
            return None
        try:
            data = response.json()
        except ValueError:
            logger.error("Backend inbound upsert returned invalid JSON")
            return None
        conv = _normalize_uuid(data.get("conversationId"))
        owner = _normalize_uuid(data.get("ownerUserId"))
        lead = _normalize_uuid(data.get("clientId"))
        if not conv or not owner:
            logger.error("Backend inbound upsert missing ids conversationId/ownerUserId")
            return None
        result = {"conversation_id": conv, "owner_user_id": owner}
        if lead:
            result["lead_id"] = lead
        return result
    except requests.Timeout:
        logger.exception("Backend inbound upsert timeout")
        return None
    except requests.RequestException:
        logger.exception("Backend inbound upsert network error")
        return None
    except Exception:
        logger.exception("Backend inbound upsert unexpected error")
        return None


def push_assistant_message_to_backend(
    phone: str,
    content: str,
    platform: str = "web",
) -> None:
    """Persiste un mensaje del assistant/bot en el backend (fuente de verdad)."""

    normalized_phone = str(phone).strip()
    normalized_content = str(content).strip()
    if not normalized_phone or not normalized_content:
        return
    default_platform = str(os.getenv("BOT_DEFAULT_INBOUND_CHANNEL", "web")).strip().lower() or "web"
    normalized_platform = str(platform or default_platform).strip().lower() or default_platform
    url = _backend_api_url("/bot/conversation-events")
    headers = _backend_headers()
    if not url or "Authorization" not in headers:
        logger.error("Skipping assistant backend write: BACKEND_API_URL or BACKEND_SERVICE_TOKEN missing")
        return
    try:
        response = requests.post(
            url,
            json={
                "user_id": normalized_phone,
                "platform": normalized_platform,
                "message": normalized_content,
                "from": "assistant",
                "selected_car": "",
                "customer_info": {},
            },
            headers=headers,
            timeout=8,
        )
        if response.status_code != 201:
            logger.error(
                "Assistant backend write failed status=%s body=%s",
                response.status_code,
                response.text[:300],
            )
    except requests.Timeout:
        logger.exception("Assistant backend write timeout")
    except requests.RequestException:
        logger.exception("Assistant backend write network error")
    except Exception:
        logger.exception("Assistant backend write unexpected error")


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


def delete_bot_session(phone: str, platform: str = "web") -> int:
    """Elimina la sesión persistida en `bot_sessions` para el usuario y canal.

    Idempotente: si no hay fila, devuelve 0. Reutilizable desde el endpoint
    `/reset` o desde nodos internos del grafo.
    """

    normalized_phone = str(phone).strip()
    default_platform = str(os.getenv("BOT_DEFAULT_INBOUND_CHANNEL", "web")).strip().lower() or "web"
    normalized_platform = str(platform or default_platform).strip().lower() or default_platform
    if not normalized_phone:
        return 0

    connection = get_connection()
    try:
        query = """
            DELETE FROM bot_sessions
            WHERE phone = %s AND platform = %s
        """
        with connection.cursor() as cursor:
            cursor.execute(query, (normalized_phone, normalized_platform))
            deleted = cursor.rowcount or 0
        connection.commit()
        return int(deleted)
    except Exception as exc:
        if _is_missing_table_error(exc):
            return 0
        raise
    finally:
        connection.close()


def reset_bot_session_state(phone: str, platform: str = "web") -> int:
    """Alias explícito para reiniciar estado persistido (borra la fila de sesión)."""

    return delete_bot_session(phone, platform)


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


def fetch_faq_candidates(question: str, limit: int = 3) -> list[str]:
    """Obtiene respuestas FAQ candidatas desde BD para preguntas generales."""

    normalized_question = str(question or "").strip()
    if not normalized_question:
        return []

    # Busca por palabras clave en question/answer para evitar dependencia de match exacto.
    terms = [
        term
        for term in re.findall(r"[a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]{3,}", normalized_question.lower())
        if term not in {"que", "como", "cual", "cuales", "para", "con", "por", "una", "unos", "unas"}
    ][:5]
    if not terms:
        terms = [normalized_question.lower()]

    connection = get_connection()
    try:
        where_clause = " OR ".join(["LOWER(question) LIKE %s OR LOWER(answer) LIKE %s" for _ in terms])
        query = f"""
            SELECT question, answer
            FROM faqs
            WHERE {where_clause}
            ORDER BY updated_at DESC
            LIMIT %s
        """
        params: list[Any] = []
        for term in terms:
            like_term = f"%{term}%"
            params.extend([like_term, like_term])
        params.append(limit)
        with connection.cursor() as cursor:
            cursor.execute(query, tuple(params))
            rows = cursor.fetchall() or []
        candidates: list[str] = []
        for row in rows:
            if not row:
                continue
            q = str(row[0] if len(row) > 0 else "").strip()
            a = str(row[1] if len(row) > 1 else "").strip()
            if q and a:
                candidates.append(f"P: {q}\nR: {a}")
            elif a:
                candidates.append(a)
        return candidates
    except Exception:
        # FAQ DB es opcional para el MVP.
        return []
    finally:
        connection.close()
