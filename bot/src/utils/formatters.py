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

    lines = ["Estos son los modelos disponibles, te interesa saber mas de alguno?"]
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
            lines.append(f"{brand}: {', '.join(models_lines)}")

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
            lines.append(f"Ano: {year}")
        lines.append("")
    return "\n".join(lines).strip()


def format_vehicle_detail(vehicle: dict[str, Any]) -> str:
    """Construye detalle completo del vehiculo (sin plan de financiamiento)."""

    brand = _title_or_default(vehicle.get("brand"))
    model = _title_or_default(vehicle.get("model"))
    year = vehicle.get("year")
    full_name = f"{brand} {model}".strip()

    lines = [f"Esta es la informacion completa de {full_name}:"]
    lines.append(f"Marca: {brand}")
    lines.append(f"Modelo: {model}")
    lines.append(f"Ano: {year if isinstance(year, int) else 'N/D'}")
    lines.append(f"Precio: {_format_currency(vehicle.get('price'))}")
    lines.append(f"Kilometraje: {_format_int(vehicle.get('km'), 'km')}")
    lines.append(f"Transmision: {_title_or_default(vehicle.get('transmission'))}")
    lines.append(f"Motor: {_title_or_default(vehicle.get('engine'))}")
    lines.append(f"Color: {_title_or_default(vehicle.get('color'))}")
    lines.append(f"Estado: {_status_label(vehicle.get('status'))}")
    description = str(vehicle.get("description", "")).strip() or "Sin descripcion disponible"
    lines.append(f"Descripcion: {description}")
    return "\n".join(lines)
