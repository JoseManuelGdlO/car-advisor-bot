"""Acceso al catalogo de vehiculos, matching y notificaciones externas."""

from __future__ import annotations

import os
import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any

import requests


def _vehicles_api_base_url() -> str:
    """Retorna base URL del backend para consultar catalogo de vehiculos."""

    return os.getenv("VEHICLES_API_BASE_URL", "http://localhost:4000").rstrip("/")


def _vehicles_api_headers() -> dict[str, str]:
    """Retorna headers para endpoint protegido si existe token."""

    token = os.getenv("BACKEND_SERVICE_TOKEN", "").strip()
    if not token:
        return {}
    return {"Authorization": f"Bearer {token}"}


def _normalize_vehicles_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
    return []


def fetch_vehicles() -> list[dict[str, Any]]:
    """Obtiene catalogo de vehiculos completo desde backend."""

    url = f"{_vehicles_api_base_url()}/api/vehicles"
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
    url = f"{_vehicles_api_base_url()}/api/vehicles/search"
    response = requests.get(url, headers=_vehicles_api_headers(), params=params, timeout=6)
    response.raise_for_status()
    return _normalize_vehicles_payload(response.json())


def fetch_vehicle_by_id(vehicle_id: str) -> dict[str, Any] | None:
    """Obtiene detalle puntual del vehiculo por id."""

    cleaned_id = str(vehicle_id or "").strip()
    if not cleaned_id:
        return None
    url = f"{_vehicles_api_base_url()}/api/vehicles/{cleaned_id}"
    response = requests.get(url, headers=_vehicles_api_headers(), timeout=6)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, dict):
        return payload
    return None


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
    mapping: dict[str, str] = {}
    for value in values:
        raw = str(value or "").strip()
        if not raw:
            continue
        mapping[normalize_user_text(raw)] = raw
    return mapping


def _best_fuzzy_match(token: str, options_map: dict[str, str], threshold: float = 0.75) -> str | None:
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


def canonicalize_with_typo_support(text: str, options: list[str], threshold: float = 0.75) -> str | None:
    """Devuelve opcion canonica con exact/contains/fuzzy para tolerar typos."""

    normalized_text = normalize_user_text(text)
    if not normalized_text:
        return None
    options_map = _options_map(options)
    if normalized_text in options_map:
        return options_map[normalized_text]
    for normalized_option, raw in options_map.items():
        if normalized_option and normalized_option in normalized_text:
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


def notify_advisor(selected_car: str, customer_info: dict[str, Any]) -> None:
    """Notifica al asesor comercial via endpoint externo configurable."""

    endpoint = os.getenv("NOTIFY_ADVISOR_URL", "http://localhost:8000/notificarAsesor")
    payload = {"selected_car": selected_car, "customer_info": customer_info}
    requests.post(endpoint, json=payload, timeout=5)
