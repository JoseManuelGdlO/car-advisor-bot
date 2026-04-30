"""Acceso al catalogo de vehiculos, matching y notificaciones externas."""

from __future__ import annotations

import json
import os
import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import requests


def _vehicles_api_base_url() -> str:
    """Retorna base URL del backend para consultar catalogo de vehiculos."""

    return os.getenv("BACKEND_API_URL", "http://localhost:4000").rstrip("/")


def _vehicles_api_headers() -> dict[str, str]:
    """Retorna headers para endpoint protegido si existe token."""

    token = os.getenv("BACKEND_SERVICE_TOKEN", "").strip()
    if not token:
        return {}
    return {"Authorization": f"Bearer {token}"}


def _public_images_base_url() -> str:
    """Retorna base publica para URLs de imagen compatibles con WhatsApp."""

    explicit = str(os.getenv("VEHICLE_IMAGES_PUBLIC_BASE_URL", "")).strip().rstrip("/")
    if explicit:
        return explicit
    backend_public = str(os.getenv("BACKEND_PUBLIC_URL", "")).strip().rstrip("/")
    if backend_public:
        return backend_public
    backend_api = str(os.getenv("BACKEND_API_URL", "")).strip()
    if backend_api:
        parts = urlsplit(backend_api)
        path = re.sub(r"/api/?$", "", parts.path or "", flags=re.IGNORECASE) or ""
        return urlunsplit((parts.scheme, parts.netloc, path, "", "")).rstrip("/")
    return "http://localhost:4000"


def _normalize_public_image_url(raw_url: str) -> str:
    """Normaliza URL de imagen para forzar esquema http/https y ruta absoluta."""

    cleaned = str(raw_url or "").strip()
    if not cleaned:
        return ""
    if cleaned.startswith("http://") or cleaned.startswith("https://"):
        return cleaned
    base = _public_images_base_url()
    if cleaned.startswith("/"):
        return f"{base}{cleaned}"
    return f"{base}/{cleaned}"


def _normalize_vehicles_payload(payload: Any) -> list[dict[str, Any]]:
    """Normaliza vehicles payload para mantener consistencia."""
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
    return []


def fetch_vehicles() -> list[dict[str, Any]]:
    """Obtiene catalogo de vehiculos completo desde backend."""

    url = f"{_vehicles_api_base_url()}/vehicles"
    response = requests.get(url, headers=_vehicles_api_headers(), timeout=6)
    response.raise_for_status()
    return _normalize_vehicles_payload(response.json())


def search_vehicles(filters: dict[str, Any]) -> list[dict[str, Any]]:
    """Busca vehiculos por filtros soportados por backend."""

    allowed_keys = {"brand", "model", "color", "year"}
    params: dict[str, Any] = {}
    for key, value in filters.items():
        if key not in allowed_keys or value in (None, ""):
            continue
        params[key] = value
    url = f"{_vehicles_api_base_url()}/vehicles/search"
    response = requests.get(url, headers=_vehicles_api_headers(), params=params, timeout=6)
    response.raise_for_status()
    return _normalize_vehicles_payload(response.json())


def fetch_vehicle_by_id(vehicle_id: str) -> dict[str, Any] | None:
    """Obtiene detalle puntual del vehiculo por id."""

    cleaned_id = str(vehicle_id or "").strip()
    if not cleaned_id:
        return None
    url = f"{_vehicles_api_base_url()}/vehicles/{cleaned_id}"
    response = requests.get(url, headers=_vehicles_api_headers(), timeout=6)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, dict):
        return payload
    return None


def _normalize_vehicle_images_payload(payload: Any) -> dict[str, Any]:
    """Normaliza respuesta de imagenes del backend a una estructura consistente."""

    if not isinstance(payload, dict):
        return {
            "images": [],
            "nextCursor": None,
            "hasMore": False,
            "total": 0,
            "limit": 0,
            "cursor": 0,
            "mode": "top",
        }

    raw_images = payload.get("images")
    images = [str(item).strip() for item in raw_images if str(item).strip()] if isinstance(raw_images, list) else []

    raw_next_cursor = payload.get("nextCursor")
    next_cursor = raw_next_cursor if isinstance(raw_next_cursor, int) and raw_next_cursor >= 0 else None
    has_more = bool(payload.get("hasMore", next_cursor is not None))

    raw_total = payload.get("total")
    total = raw_total if isinstance(raw_total, int) and raw_total >= 0 else len(images)

    raw_limit = payload.get("limit")
    limit = raw_limit if isinstance(raw_limit, int) and raw_limit >= 0 else len(images)

    raw_cursor = payload.get("cursor")
    cursor = raw_cursor if isinstance(raw_cursor, int) and raw_cursor >= 0 else 0

    mode = str(payload.get("mode", "top")).strip().lower() or "top"
    if mode not in {"top", "next"}:
        mode = "top"

    return {
        "images": images,
        "nextCursor": next_cursor,
        "hasMore": has_more,
        "total": total,
        "limit": limit,
        "cursor": cursor,
        "mode": mode,
    }


def fetch_vehicle_images(
    vehicle_id: str,
    mode: str = "top",
    limit: int | None = None,
    cursor: int | None = None,
) -> dict[str, Any]:
    """Obtiene imagenes paginadas de un vehiculo por ID."""

    cleaned_id = str(vehicle_id or "").strip()
    normalized_mode = "next" if str(mode).strip().lower() == "next" else "top"
    if not cleaned_id:
        return _normalize_vehicle_images_payload({"mode": normalized_mode})

    params: dict[str, Any] = {"mode": normalized_mode}
    if isinstance(limit, int) and limit > 0:
        params["limit"] = limit
    if normalized_mode == "next" and isinstance(cursor, int) and cursor >= 0:
        params["cursor"] = cursor

    url = f"{_vehicles_api_base_url()}/vehicles/{cleaned_id}/images"
    response = requests.get(url, headers=_vehicles_api_headers(), params=params, timeout=6)
    if response.status_code == 404:
        return _normalize_vehicle_images_payload({"mode": normalized_mode})
    response.raise_for_status()
    return _normalize_vehicle_images_payload(response.json())


def build_whatsapp_image_messages(
    to: str,
    vehicle_id: str,
    caption: str | None = None,
    limit: int = 3,
    mode: str = "top",
    cursor: int | None = None,
    image_urls: list[str] | None = None,
) -> list[dict[str, str]]:
    """Construye mensajes WhatsApp tipo image compatibles con backend WC."""

    normalized_to = str(to or "").strip()
    normalized_caption = str(caption or "").strip()
    if isinstance(image_urls, list):
        images_source = [_normalize_public_image_url(str(url or "").strip()) for url in image_urls if str(url or "").strip()]
    else:
        images_payload = fetch_vehicle_images(vehicle_id=vehicle_id, mode=mode, limit=limit, cursor=cursor)
        images_source = [
            _normalize_public_image_url(str(url or "").strip())
            for url in images_payload.get("images", [])
            if str(url or "").strip()
        ]
    messages: list[dict[str, str]] = []
    for normalized_url in images_source:
        if not normalized_to or not normalized_url:
            continue
        message: dict[str, str] = {
            "to": normalized_to,
            "type": "image",
            "imageUrl": normalized_url,
        }
        if normalized_caption:
            message["caption"] = normalized_caption
        messages.append(message)
    return messages


def fetch_vehicles_catalog() -> list[dict[str, Any]]:
    """Compatibilidad: alias de fetch_vehicles."""

    return fetch_vehicles()


def normalize_user_text(text: str) -> str:
    """Normaliza texto: lowercase, trim, acentos y espacios."""

    cleaned = unicodedata.normalize("NFKD", str(text or ""))
    no_accents = "".join(ch for ch in cleaned if not unicodedata.combining(ch))
    simplified = re.sub(r"[^a-zA-Z0-9\s]", " ", no_accents.lower())
    return re.sub(r"\s+", " ", simplified).strip()


def _options_map(values: list[str]) -> dict[str, str]:
    """Helper de apoyo para options map."""
    mapping: dict[str, str] = {}
    for value in values:
        raw = str(value or "").strip()
        if not raw:
            continue
        mapping[normalize_user_text(raw)] = raw
    return mapping


def _best_fuzzy_match(token: str, options_map: dict[str, str], threshold: float = 0.75) -> str | None:
    """Helper de apoyo para best fuzzy match."""
    best_key = ""
    best_score = 0.0
    for normalized_option in options_map:
        score = SequenceMatcher(None, token, normalized_option).ratio()
        if score > best_score:
            best_score = score
            best_key = normalized_option
    if best_score >= threshold and best_key:
        return options_map[best_key]
    return None


def _term_matches_as_whole_words(haystack: str, term: str) -> bool:
    """Evita que modelos cortos (ej. Ram) coincidan como subcadena de otra palabra (ej. muestrame)."""

    if not term:
        return False
    parts = [p for p in str(term).strip().split() if p]
    if not parts:
        return False
    if len(parts) == 1:
        return re.search(rf"(?<![a-z0-9]){re.escape(parts[0])}(?![a-z0-9])", haystack) is not None
    segs = [re.escape(p) for p in parts]
    return re.search(rf"(?<![a-z0-9])" + r"\s+".join(segs) + r"(?![a-z0-9])", haystack) is not None


def canonicalize_with_typo_support(text: str, options: list[str], threshold: float = 0.75) -> str | None:
    """Devuelve opcion canonica con exact/contains/fuzzy para tolerar typos."""

    normalized_text = normalize_user_text(text)
    if not normalized_text:
        return None
    options_map = _options_map(options)
    if normalized_text in options_map:
        return options_map[normalized_text]
    for normalized_option, raw in options_map.items():
        if normalized_option and _term_matches_as_whole_words(normalized_text, normalized_option):
            return raw
    tokens = [token for token in normalized_text.split(" ") if token]
    for token in tokens:
        if token in options_map:
            return options_map[token]
    for token in tokens:
        fuzzy = _best_fuzzy_match(token, options_map, threshold=threshold)
        if fuzzy:
            return fuzzy
    return _best_fuzzy_match(normalized_text, options_map, threshold=threshold)


def detect_vehicle_filters(user_text: str, vehicles: list[dict[str, Any]]) -> dict[str, Any]:
    """Extrae filtros brand/model/color/year con normalizacion y typo handling."""

    normalized = normalize_user_text(user_text)
    filters: dict[str, Any] = {}
    if not normalized:
        return filters

    years = re.findall(r"\b(?:19|20)\d{2}\b", normalized)
    if years:
        filters["year"] = int(years[-1])

    brands = sorted(
        {str(item.get("brand", "")).strip() for item in vehicles if str(item.get("brand", "")).strip()}
    )
    models = sorted(
        {str(item.get("model", "")).strip() for item in vehicles if str(item.get("model", "")).strip()}
    )
    colors = sorted(
        {str(item.get("color", "")).strip() for item in vehicles if str(item.get("color", "")).strip()}
    )

    brand = canonicalize_with_typo_support(user_text, brands, threshold=0.78)
    if brand:
        filters["brand"] = brand
    model = canonicalize_with_typo_support(user_text, models, threshold=0.76)
    if model:
        filters["model"] = model
    color = canonicalize_with_typo_support(user_text, colors, threshold=0.8)
    if color:
        filters["color"] = color

    return filters


def resolve_vehicle_candidates(user_text: str, vehicles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Busca candidatos de vehiculo especifico usando filtros inferidos."""

    filters = detect_vehicle_filters(user_text, vehicles)
    if not filters:
        return []
    candidates: list[dict[str, Any]] = []
    for item in vehicles:
        matches = True
        for key, expected in filters.items():
            if key == "year":
                if int(item.get("year", 0) or 0) != int(expected):
                    matches = False
                    break
            else:
                current = str(item.get(key, "")).strip().lower()
                if current != str(expected).strip().lower():
                    matches = False
                    break
        if matches:
            candidates.append(item)
    return candidates


def available_brands() -> list[str]:
    """Retorna marcas disponibles unicas desde el catalogo real."""

    vehicles = fetch_vehicles()
    seen: set[str] = set()
    brands: list[str] = []
    for item in vehicles:
        brand = str(item.get("brand", "")).strip()
        if not brand:
            continue
        key = normalize_user_text(brand)
        if key in seen:
            continue
        seen.add(key)
        brands.append(brand)
    return brands


def available_models_by_brand(brand: str) -> list[str]:
    """Retorna modelos disponibles para una marca especifica."""

    normalized_brand = normalize_user_text(brand)
    if not normalized_brand:
        return []
    vehicles = fetch_vehicles()
    seen: set[str] = set()
    models: list[str] = []
    for item in vehicles:
        item_brand = normalize_user_text(item.get("brand", ""))
        if item_brand != normalized_brand:
            continue
        model = str(item.get("model", "")).strip()
        if not model:
            continue
        key = normalize_user_text(model)
        if key in seen:
            continue
        seen.add(key)
        models.append(model)
    return models


def notify_advisor(
    selected_car: str,
    customer_info: dict[str, Any],
    owner_user_id: str,
    financing_selection: dict[str, Any] | None = None,
    promotion_selection: dict[str, Any] | None = None,
) -> bool:
    """Envia push al owner via backend API `/push/send`."""

    normalized_owner_user_id = str(owner_user_id or "").strip()
    if not normalized_owner_user_id:
        return False

    endpoint = f"{_vehicles_api_base_url()}/push/send"
    customer_name = str(customer_info.get("nombre", "")).strip()
    customer_phone = str(customer_info.get("telefono", "")).strip()
    customer_email = str(customer_info.get("email", "")).strip()
    normalized_financing = financing_selection or {}
    normalized_promotion = promotion_selection or {}
    payload = {
        "ownerUserId": normalized_owner_user_id,
        "title": "Nuevo lead interesado en vehiculo",
        "body": (
            f"{customer_name or 'Cliente'} quiere informacion de {selected_car}. "
            f"Telefono: {customer_phone or 'N/D'}."
        ),
        "data": {
            "selected_car": str(selected_car or "").strip(),
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "customer_email": customer_email,
            "financing_selection": json.dumps(normalized_financing, ensure_ascii=True, separators=(",", ":")),
            "promotion_selection": json.dumps(normalized_promotion, ensure_ascii=True, separators=(",", ":")),
        },
    }
    headers = {
        **_vehicles_api_headers(),
        "Content-Type": "application/json",
    }
    response = requests.post(endpoint, json=payload, headers=headers, timeout=6)
    response.raise_for_status()
    return True
