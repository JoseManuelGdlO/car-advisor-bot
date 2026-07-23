"""Utilidades de persistencia de sesion en MySQL para el bot."""

from __future__ import annotations

import json
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

import mysql.connector
import requests
from mysql.connector.connection import MySQLConnection
from mysql.connector.errors import Error as MySQLError

from src.context.tenant_context import get_owner_user_id

logger = logging.getLogger(__name__)

DEFAULT_CALENDAR_SCHEDULING_URL = "https://calendar.app.google/tYniJNfcrd8qXvut8"

DEFAULT_BOT_SETTINGS = {
    "tone": "cercano",
    "emojiStyle": "frecuentes",
    "salesProactivity": "alto",
    "customInstructions": "Eres una persona muy amable y autentica",
    "calendarSchedulingUrl": DEFAULT_CALENDAR_SCHEDULING_URL,
}

DEFAULT_BUSINESS_PROFILE: dict[str, str | None] = {
    "tradeName": None,
    "businessPhone": None,
    "businessEmail": None,
    "website": None,
    "addressLine": None,
    "city": None,
    "state": None,
    "country": None,
    "description": None,
    "logoUrl": None,
}

_BUSINESS_PROFILE_KEYS = tuple(DEFAULT_BUSINESS_PROFILE.keys())


def _normalize_uuid(value: Any) -> str | None:
    """Convierte UUID devuelto por MySQL (str/bytes/...) a string estandar."""

    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8")
    text = str(value).strip()
    return text or None


def _backend_headers() -> dict[str, str]:
    """Helper de apoyo para backend headers."""
    token = os.getenv("BACKEND_SERVICE_TOKEN", "").strip()
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"} if token else {}


def _owner_from_context(explicit: str | None = None) -> str:
    """Owner explícito o del contextvar del request."""

    explicit_owner = str(explicit or "").strip()
    if explicit_owner:
        return explicit_owner
    return get_owner_user_id()


def _owner_query_params(explicit: str | None = None) -> dict[str, str]:
    """Query params de tenant para GET al backend."""

    owner = _owner_from_context(explicit)
    if not owner:
        logger.warning("Backend request without owner_user_id in context")
        return {}
    return {"ownerUserId": owner}


def _with_owner_body(body: dict[str, Any], explicit: str | None = None) -> dict[str, Any]:
    """Añade owner_user_id al body JSON si hay owner resuelto."""

    payload = dict(body)
    owner = _owner_from_context(explicit)
    if owner:
        payload["owner_user_id"] = owner
    return payload


def _backend_api_url(path: str) -> str:
    """Helper de apoyo para backend api url."""
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


def _optional_setting(value: Any) -> str | None:
    """Normaliza setting opcional sin fallback a texto por defecto."""

    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.lower() in {"none", "null", "undefined"}:
        return None
    return text


_bot_tenant_cache: dict[str, tuple[dict[str, Any], float]] = {}


def _bot_settings_cache_ttl_seconds() -> float:
    """TTL de caché en segundos; 0 desactiva caché (siempre refetch)."""

    raw = os.getenv("BOT_SETTINGS_CACHE_TTL_SECONDS", "60").strip()
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 60.0


def clear_bot_settings_cache(owner_id: str | None = None) -> None:
    """Vacía la caché de settings (tests o forzar lectura fresca)."""

    global _bot_tenant_cache
    if owner_id:
        _bot_tenant_cache.pop(str(owner_id).strip(), None)
    else:
        _bot_tenant_cache = {}


def _normalize_business_profile_payload(payload: Any) -> dict[str, str | None]:
    """Normaliza businessProfile del backend con claves estables."""

    if not isinstance(payload, dict):
        return dict(DEFAULT_BUSINESS_PROFILE)
    normalized: dict[str, str | None] = {}
    for key in _BUSINESS_PROFILE_KEYS:
        raw = payload.get(key)
        if raw is None:
            normalized[key] = None
            continue
        text = str(raw).strip()
        normalized[key] = text or None
    return normalized


def _fetch_bot_tenant_config() -> dict[str, Any]:
    """Obtiene settings + businessProfile del backend con caché en memoria (TTL)."""

    global _bot_tenant_cache
    owner_key = _owner_from_context() or "__default__"
    ttl = _bot_settings_cache_ttl_seconds()
    if ttl > 0 and owner_key in _bot_tenant_cache:
        cached, cached_at = _bot_tenant_cache[owner_key]
        if time.monotonic() - cached_at < ttl:
            return {
                "settings": dict(cached["settings"]),
                "businessProfile": dict(cached["businessProfile"]),
            }

    url = _backend_api_url("/bot/settings")
    headers = _backend_headers()
    if not url or "Authorization" not in headers:
        return {
            "settings": dict(DEFAULT_BOT_SETTINGS),
            "businessProfile": dict(DEFAULT_BUSINESS_PROFILE),
        }

    params = _owner_query_params()
    try:
        response = requests.get(url, headers=headers, params=params or None, timeout=6)
        if response.status_code != 200:
            logger.warning("Bot settings fetch failed status=%s", response.status_code)
            return {
                "settings": dict(DEFAULT_BOT_SETTINGS),
                "businessProfile": dict(DEFAULT_BUSINESS_PROFILE),
            }
        payload = response.json()
        if not isinstance(payload, dict):
            return {
                "settings": dict(DEFAULT_BOT_SETTINGS),
                "businessProfile": dict(DEFAULT_BUSINESS_PROFILE),
            }
        resolved_settings = {
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
            "calendarSchedulingUrl": _clean_setting(
                payload.get("calendarSchedulingUrl"),
                DEFAULT_BOT_SETTINGS["calendarSchedulingUrl"],
            ),
            "botName": _optional_setting(payload.get("botName")),
            "welcomeMessage": _optional_setting(payload.get("welcomeMessage")),
            "faqFallbackMessage": _optional_setting(payload.get("faqFallbackMessage")),
            "downPaymentMessage": _optional_setting(payload.get("downPaymentMessage")),
            "visitIncentiveMessage": _optional_setting(payload.get("visitIncentiveMessage")),
        }
        resolved_profile = _normalize_business_profile_payload(payload.get("businessProfile"))
    except Exception:
        logger.exception("Bot settings fetch failed unexpectedly")
        return {
            "settings": dict(DEFAULT_BOT_SETTINGS),
            "businessProfile": dict(DEFAULT_BUSINESS_PROFILE),
        }

    resolved = {
        "settings": resolved_settings,
        "businessProfile": resolved_profile,
    }
    if ttl > 0:
        _bot_tenant_cache[owner_key] = (resolved, time.monotonic())
    return {
        "settings": dict(resolved_settings),
        "businessProfile": dict(resolved_profile),
    }


def get_business_profile() -> dict[str, str | None]:
    """Perfil comercial del tenant (desde /bot/settings, con caché)."""

    return dict(_fetch_bot_tenant_config()["businessProfile"])


def get_bot_settings() -> dict[str, str]:
    """Obtiene bot settings desde backend con fallback seguro y caché en memoria (TTL)."""

    return dict(_fetch_bot_tenant_config()["settings"])


def push_event_to_backend(payload: dict[str, Any], *, owner_user_id: str | None = None) -> None:
    """Envia eventos del bot al backend Node cuando existe configuracion."""
    url = _backend_api_url("/bot/conversation-events")
    headers = _backend_headers()
    if not url or "Authorization" not in headers:
        return
    try:
        requests.post(
            url,
            json=_with_owner_body(payload, explicit=owner_user_id),
            headers=headers,
            timeout=5,
        )
    except Exception:
        return


def persist_commercial_selection_to_backend(
    state: Mapping[str, Any],
    *,
    financing_selection: dict[str, Any] | None = None,
    promotion_selection: dict[str, Any] | None = None,
    message: str = "",
) -> None:
    """Persiste plan/promo mostrado en notes del lead sin cerrar lead_capture."""

    financing = financing_selection if isinstance(financing_selection, dict) else {}
    promotion = promotion_selection if isinstance(promotion_selection, dict) else {}
    if not financing and not promotion:
        return
    phone = str(state.get("phone") or state.get("user_id") or "").strip()
    if not phone:
        return
    default_platform = str(os.getenv("BOT_DEFAULT_INBOUND_CHANNEL", "web")).strip().lower() or "web"
    platform = str(state.get("platform") or default_platform).strip().lower() or default_platform
    selected_car = str(state.get("selected_car") or "").strip()
    owner = str(state.get("owner_user_id") or "").strip() or None
    push_event_to_backend(
        {
            "user_id": phone,
            "platform": platform,
            "message": str(message or "").strip() or "Consulta comercial registrada",
            "from": "system",
            "selected_car": selected_car,
            "customer_info": {},
            "financing_selection": financing,
            "promotion_selection": promotion,
        },
        owner_user_id=owner,
    )


def _normalize_financing_plans_payload(payload: Any) -> list[dict[str, Any]]:
    """Normaliza financing plans payload para mantener consistencia."""
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
    """Normaliza promotions payload para mantener consistencia."""
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
    response = requests.get(
        url, headers=headers, params=_owner_query_params() or None, timeout=6
    )
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
    response = requests.get(
        url, headers=headers, params=_owner_query_params() or None, timeout=6
    )
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
    response = requests.get(
        url, headers=headers, params=_owner_query_params() or None, timeout=6
    )
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
    response = requests.get(
        url, headers=headers, params=_owner_query_params() or None, timeout=6
    )
    if response.status_code == 404:
        return []
    response.raise_for_status()
    return _normalize_promotions_payload(response.json())


def upsert_inbound_user_message(
    phone: str,
    message: str,
    platform: str = "web",
    *,
    owner_user_id: str | None = None,
) -> dict[str, Any] | None:
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
            json=_with_owner_body(
                {
                    "user_id": normalized_phone,
                    "platform": normalized_platform,
                    "message": normalized_message,
                    "from": "client",
                    "selected_car": "",
                    "customer_info": {},
                },
                explicit=owner_user_id,
            ),
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
        raw_should = data.get("shouldAutoReply")
        result["should_auto_reply"] = True if not isinstance(raw_should, bool) else raw_should
        client_name = str(data.get("clientName") or "").strip()
        if client_name:
            result["client_name"] = client_name
        client_display_phone = str(data.get("clientDisplayPhone") or "").strip()
        if client_display_phone:
            result["client_display_phone"] = client_display_phone
        customer_info = data.get("customerInfo")
        if isinstance(customer_info, dict) and customer_info:
            result["customer_info"] = customer_info
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


def set_conversation_human_controlled(
    conversation_id: str,
    *,
    is_human_controlled: bool = True,
    owner_user_id: str | None = None,
) -> bool:
    """Marca la conversacion en CRM como control humano (handoff tras notificacion)."""

    normalized_id = _normalize_uuid(conversation_id)
    if not normalized_id:
        return False
    url = _backend_api_url(f"/bot/conversations/{normalized_id}/control")
    headers = _backend_headers()
    if not url or "Authorization" not in headers:
        logger.warning(
            "Skipping conversation control: missing BACKEND_API_URL or BACKEND_SERVICE_TOKEN"
        )
        return False
    try:
        response = requests.patch(
            url,
            json=_with_owner_body(
                {"isHumanControlled": is_human_controlled},
                explicit=owner_user_id,
            ),
            headers=headers,
            timeout=6,
        )
        if response.status_code == 404:
            return False
        response.raise_for_status()
        return True
    except requests.RequestException:
        logger.exception(
            "Failed to set conversation human control conversation_id=%s",
            normalized_id,
        )
        return False


def sync_customer_info_to_backend(
    phone: str,
    customer_info: dict[str, Any],
    *,
    platform: str = "web",
    owner_user_id: str | None = None,
) -> None:
    """Sincroniza datos de contacto del cliente con el CRM."""

    normalized_phone = str(phone).strip()
    if not normalized_phone or not isinstance(customer_info, dict):
        return
    usable = {
        key: str(value).strip()
        for key, value in customer_info.items()
        if value is not None and str(value).strip()
    }
    if not usable:
        return
    default_platform = str(os.getenv("BOT_DEFAULT_INBOUND_CHANNEL", "web")).strip().lower() or "web"
    normalized_platform = str(platform or default_platform).strip().lower() or default_platform
    push_event_to_backend(
        {
            "user_id": normalized_phone,
            "platform": normalized_platform,
            "message": "Nombre registrado",
            "from": "system",
            "selected_car": "",
            "customer_info": usable,
        },
        owner_user_id=owner_user_id,
    )


def push_assistant_message_to_backend(
    phone: str,
    content: str,
    platform: str = "web",
    *,
    customer_info: dict[str, Any] | None = None,
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
        payload: dict[str, Any] = {
            "user_id": normalized_phone,
            "platform": normalized_platform,
            "message": normalized_content,
            "from": "assistant",
            "selected_car": "",
        }
        if isinstance(customer_info, dict) and customer_info:
            payload["customer_info"] = customer_info
        response = requests.post(
            url,
            json=_with_owner_body(payload),
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
        expires_at = datetime.now(timezone.utc) + timedelta(hours=12)
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


def _faq_rows_to_entries(rows: list[Any]) -> list[dict[str, str]]:
    """Normaliza filas de faqs a entradas con id, question y answer."""

    entries: list[dict[str, str]] = []
    for row in rows:
        if not row:
            continue
        faq_id = str(row[0] if len(row) > 0 else "").strip()
        question = str(row[1] if len(row) > 1 else "").strip()
        answer = str(row[2] if len(row) > 2 else "").strip()
        if not question and not answer:
            continue
        entries.append(
            {
                "id": faq_id,
                "question": question,
                "answer": answer,
            }
        )
    return entries


def faq_entry_to_candidate(entry: dict[str, str]) -> str:
    """Formatea una entrada FAQ para contexto del generador."""

    question = str(entry.get("question", "")).strip()
    answer = str(entry.get("answer", "")).strip()
    if question and answer:
        return f"P: {question}\nR: {answer}"
    if answer:
        return answer
    return question


def fetch_all_faqs_for_owner(limit: int = 200) -> list[dict[str, str]]:
    """Obtiene todas las FAQs del tenant actual (hasta `limit`)."""

    owner_user_id = _owner_from_context()
    if not owner_user_id:
        logger.warning("fetch_all_faqs_for_owner skipped: missing owner_user_id in context")
        return []

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, question, answer
                FROM faqs
                WHERE owner_user_id = %s
                ORDER BY updated_at DESC
                LIMIT %s
                """,
                (owner_user_id, max(1, int(limit))),
            )
            rows = cursor.fetchall() or []
        return _faq_rows_to_entries(rows)
    except Exception:
        return []
    finally:
        connection.close()


def fetch_faq_candidates(question: str, limit: int = 12) -> list[str]:
    """Carga todas las FAQs del tenant y usa LLM para elegir las relevantes a la pregunta."""

    normalized_question = str(question or "").strip()
    if not normalized_question:
        return []

    all_faqs = fetch_all_faqs_for_owner()
    if not all_faqs:
        return []

    # Import diferido para evitar ciclo database <-> llm_responses.
    from src.services.llm_responses import select_faq_candidates_with_llm

    return select_faq_candidates_with_llm(
        normalized_question,
        all_faqs,
        max_candidates=max(1, int(limit)),
    )
