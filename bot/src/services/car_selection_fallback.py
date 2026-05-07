"""Heurísticas determinísticas de respaldo para `car_selection`."""

from __future__ import annotations

import re
from typing import Any, Callable

from src.tools.vehicles import normalize_user_text


def is_general_request(user_text: str, general_signals_normalized: set[str]) -> bool:
    """Detecta solicitudes amplias de catálogo sin filtro puntual."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return True
    return any(signal in normalized for signal in general_signals_normalized)


def looks_like_feature_request(user_text: str, feature_signals_normalized: set[str]) -> bool:
    """Detecta intención de filtrar por atributos (marca/modelo/color/año)."""

    normalized = normalize_user_text(user_text)
    has_year = bool(re.search(r"\b(?:19|20)\d{2}\b", normalized))
    return has_year or any(signal in normalized for signal in feature_signals_normalized)


def looks_like_specific_vehicle_request(
    user_text: str,
    *,
    is_general_request_fn: Callable[[str], bool],
    looks_like_feature_request_fn: Callable[[str], bool],
) -> bool:
    """Detecta preguntas por un modelo/marca puntual aunque no exista en catálogo."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    if re.search(r"\b(modelo|marca)\s+[a-z0-9]+\b", normalized):
        return True
    if re.search(r"\b(tienes|hay|busco|quiero)\s+[a-z0-9]+\b", normalized):
        return not is_general_request_fn(user_text)
    if re.search(r"\b(?:el|la|un|una)\s+[a-z]{3,}\s+\d{1,4}\b", normalized):
        return True
    if looks_like_feature_request_fn(user_text) and re.search(r"\b[a-z]{3,}\s+\d{1,4}\b", normalized):
        return True
    return False


def contains_signal_phrase(normalized_text: str, signal: str) -> bool:
    """Busca una señal respetando límites de palabra para evitar falsos positivos."""

    parts = [part for part in str(signal or "").split() if part]
    if not parts:
        return False
    pattern = r"(?<![a-z0-9])" + r"\s+".join(re.escape(part) for part in parts) + r"(?![a-z0-9])"
    return re.search(pattern, normalized_text) is not None


def is_more_images_request(user_text: str, more_images_signals_normalized: set[str]) -> bool:
    """Detecta intención de ver más fotos del vehículo en contexto."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return any(signal in normalized for signal in more_images_signals_normalized)


def is_financing_request(user_text: str, financing_signals_normalized: set[str]) -> bool:
    """Detecta preguntas de financiamiento con señales normalizadas."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return any(contains_signal_phrase(normalized, signal) for signal in financing_signals_normalized)


def is_promotions_request(user_text: str, promotions_signals_normalized: set[str]) -> bool:
    """Detecta interés en promociones u ofertas vigentes."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return any(contains_signal_phrase(normalized, signal) for signal in promotions_signals_normalized)


def is_selected_vehicle_specs_request(
    user_text: str,
    *,
    selected_vehicle_id: str,
    vehicles: list[dict[str, Any]],
    pick_vehicle_from_filters_fn: Callable[[str, list[dict[str, Any]]], dict[str, Any] | None],
) -> bool:
    """True si pide ficha/datos del vehículo en contexto (no cambiar a otro modelo)."""

    normalized = normalize_user_text(user_text)
    if not normalized or not str(selected_vehicle_id).strip():
        return False

    other_vehicle_signals = (
        "otro modelo",
        "otro vehiculo",
        "otro carro",
        "otro auto",
        "otros vehiculos",
        "otros modelos",
        "ver otros",
        "mas opciones",
    )
    if any(signal in normalized for signal in other_vehicle_signals):
        return False

    specs_signals = (
        "datos del modelo",
        "datos del vehiculo",
        "datos del carro",
        "datos del auto",
        "dame los datos del",
        "dame la ficha",
        "muestrame los datos",
        "ficha tecnica",
        "ficha del auto",
        "ficha del vehiculo",
        "ficha del modelo",
        "ficha del carro",
        "especificaciones del modelo",
        "especificaciones del vehiculo",
        "especificaciones del carro",
        "caracteristicas del modelo",
        "caracteristicas del vehiculo",
        "informacion del modelo",
        "informacion del vehiculo",
        "informacion completa del",
        "toda la informacion del",
    )
    if not any(signal in normalized for signal in specs_signals):
        return False

    other = pick_vehicle_from_filters_fn(user_text, vehicles)
    cur_id = str(selected_vehicle_id).strip()
    other_id = str(other.get("id", "")).strip() if isinstance(other, dict) else ""
    if other_id and other_id != cur_id:
        return False
    return True
