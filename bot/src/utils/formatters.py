"""Formateadores de texto para respuestas de catalogo de vehiculos."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal, InvalidOperation
from typing import Any


def _title_or_default(value: Any, fallback: str = "N/D") -> str:
    text = str(value or "").strip()
    if not text:
        return fallback
    return text.title()


def _format_currency(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "N/D"
    try:
        amount = Decimal(raw)
    except (InvalidOperation, ValueError):
        return raw
    return f"${amount:,.2f}"


def _format_int(value: Any, suffix: str = "") -> str:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return "N/D"
    if suffix:
        return f"{parsed:,} {suffix}".strip()
    return f"{parsed:,}"


def _status_label(status: Any) -> str:
    normalized = str(status or "").strip().lower()
    mapping = {
        "available": "Disponible",
        "reserved": "Reservado",
        "sold": "Vendido",
    }
    return mapping.get(normalized, _title_or_default(status))


def _bold_label(text: str, platform: str) -> str:
    normalized_platform = str(platform or "web").strip().lower()
    marker = "*" if normalized_platform == "whatsapp" else "**"
    return f"{marker}{text}{marker}"


def format_available_vehicles_grouped(vehicles: list[dict[str, Any]]) -> str:
    """Agrupa disponibles por marca y modelo; agrega año cuando hay repetidos."""

    available = [item for item in vehicles if str(item.get("status", "")).strip().lower() == "available"]
    if not available:
        return "No tengo vehiculos disponibles en este momento. Si quieres, puedo ayudarte a buscar por otra caracteristica."

    grouped: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
    for item in available:
        brand = _title_or_default(item.get("brand"), fallback="")
        model = _title_or_default(item.get("model"), fallback="")
        if not brand or not model:
            continue
        year = item.get("year")
        if isinstance(year, int):
            grouped[brand][model].append(year)

    lines: list[str] = []
    for brand in sorted(grouped):
        models_lines: list[str] = []
        for model in sorted(grouped[brand]):
            years = sorted(set(grouped[brand][model]))
            if len(years) > 1:
                years_text = ", ".join(str(year) for year in years)
                models_lines.append(f"{model} ({years_text})")
            else:
                models_lines.append(model)
        if models_lines:
            emoji = "🚗"
            lines.append(f"{emoji} {brand}: {', '.join(models_lines)}")

    return "\n".join(lines)


def format_filtered_vehicles(vehicles: list[dict[str, Any]]) -> str:
    """Presenta resultados de filtros con marca y modelo."""

    if not vehicles:
        return "No encontre vehiculos que coincidan con esas caracteristicas. Si quieres, probamos con otra combinacion."

    lines = ["Tenemos estos modelos con las caracteristicas que estas buscando 😊🚗", ""]
    for item in vehicles:
        brand = _title_or_default(item.get("brand"))
        model = _title_or_default(item.get("model"))
        year = item.get("year")
        lines.append(f"Marca: {brand}")
        lines.append(f"Modelo: {model}")
        if isinstance(year, int):
            lines.append(f"Año: {year}")
        lines.append("")
    return "\n".join(lines).strip()


def format_vehicle_detail(vehicle: dict[str, Any], platform: str = "web") -> str:
    """Construye detalle compacto del vehiculo en dos columnas."""

    brand = _title_or_default(vehicle.get("brand"))
    model = _title_or_default(vehicle.get("model"))
    year = vehicle.get("year")
    description = str(vehicle.get("description", "")).strip() or "Sin descripcion disponible"

    rows = [
        (_bold_label("Marca", platform) + f": {brand}", _bold_label("Modelo", platform) + f": {model}"),
        (
            _bold_label("Año", platform) + f": {year if isinstance(year, int) else 'N/D'}",
            _bold_label("Precio", platform) + f": {_format_currency(vehicle.get('price'))}",
        ),
        (
            _bold_label("Kilometraje", platform) + f": {_format_int(vehicle.get('km'), 'km')}",
            _bold_label("Transmisión", platform) + f": {_title_or_default(vehicle.get('transmission'))}",
        ),
        (
            _bold_label("Motor", platform) + f": {_title_or_default(vehicle.get('engine'))}",
            _bold_label("Color", platform) + f": {_title_or_default(vehicle.get('color'))}",
        ),
        (_bold_label("Descripción", platform) + f": {description}", ""),
    ]
    left_width = max(len(left) for left, _ in rows) + 2
    lines = [f"{left.ljust(left_width)}{right}".rstrip() for left, right in rows]
    return "\n".join(lines)
