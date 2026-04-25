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


def _bold_labels(labels: list[str], platform: str = "web") -> dict[str, str]:
    """Devuelve un mapa etiqueta->etiqueta en negritas para reutilizar formateo."""

    return {label: _bold_label(label, platform) for label in labels}


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


def _format_rate(rate: Any, show_rate: bool = True) -> str:
    if not show_rate:
        return "Tasa sujeta a evaluacion"
    raw = str(rate or "").strip()
    if not raw:
        return "N/D"
    try:
        parsed = Decimal(raw)
    except (InvalidOperation, ValueError):
        return raw
    return f"{parsed:.2f}%"


def _vehicle_label(vehicle: dict[str, Any]) -> str:
    brand = _title_or_default(vehicle.get("brand"))
    model = _title_or_default(vehicle.get("model"))
    year = vehicle.get("year")
    if isinstance(year, int):
        return f"{brand} {model} {year}"
    return f"{brand} {model}".strip()


def _available_plan_vehicles(plan: dict[str, Any]) -> list[dict[str, Any]]:
    vehicles = plan.get("vehicles")
    raw_items = [item for item in vehicles if isinstance(item, dict)] if isinstance(vehicles, list) else []
    filtered: list[dict[str, Any]] = []
    for item in raw_items:
        status = str(item.get("status", "")).strip().lower()
        if status and status != "available":
            continue
        filtered.append(item)
    return filtered


def format_financing_plans(plans: list[dict[str, Any]], platform: str = "web") -> str:
    """Formatea planes de financiamiento con requisitos y vehiculos asociados."""

    active_plans = [item for item in plans if isinstance(item, dict) and bool(item.get("active", True))]
    if not active_plans:
        return "No hay planes de financiamiento disponibles en este momento."

    bold_labels = _bold_labels(
        ["Tasa", "Plazo maximo", "Requisitos", "Vehiculos disponibles", "Vehiculos"],
        platform,
    )
    lines = ["Estos son los planes de financiamiento disponibles:", ""]
    printed = 0
    for idx, plan in enumerate(active_plans, start=1):
        available_vehicles = _available_plan_vehicles(plan)
        if not available_vehicles:
            continue
        printed += 1
        name = str(plan.get("name", "")).strip() or f"Plan {idx}"
        lender = str(plan.get("lender", "")).strip() or "N/D"
        max_term = _format_int(plan.get("maxTermMonths"), "meses")
        rate = _format_rate(plan.get("rate"), bool(plan.get("showRate", True)))
        lines.append(f"{printed}. {name} ({lender})")
        lines.append(f"   - {bold_labels['Tasa']}: {rate}")
        lines.append(f"   - {bold_labels['Plazo maximo']}: {max_term}")

        requirements = plan.get("requirements")
        req_values = [
            str(item.get("title", "")).strip()
            for item in requirements
            if isinstance(item, dict) and str(item.get("title", "")).strip()
        ] if isinstance(requirements, list) else []
        if req_values:
            lines.append(f"   - {bold_labels['Requisitos']}: {', '.join(req_values)}")

        vehicle_values = [
            _vehicle_label(item)
            for item in available_vehicles
        ]
        lines.append(f"   - {bold_labels['Vehiculos disponibles']}:")
        for vehicle in vehicle_values:
            lines.append(f"     - {vehicle}")
        lines.append("")
    if not printed:
        return "No hay planes de financiamiento con vehiculos disponibles en este momento."
    return "\n".join(lines).strip()


def format_financing_plans_for_vehicle(
    vehicle_name: str,
    plans: list[dict[str, Any]],
    platform: str = "web",
) -> str:
    """Formatea planes aplicables a un vehiculo puntual."""

    normalized_vehicle = str(vehicle_name or "").strip() or "este vehiculo"
    active_plans = [item for item in plans if isinstance(item, dict) and bool(item.get("active", True))]
    if not active_plans:
        return f"No encontre planes de financiamiento activos para {normalized_vehicle}."

    bold_labels = _bold_labels(["Tasa", "Plazo maximo", "Requisitos"], platform)
    lines = [f"Planes de financiamiento para {normalized_vehicle}:", ""]
    printed = 0
    for idx, plan in enumerate(active_plans, start=1):
        available_vehicles = _available_plan_vehicles(plan)
        if not available_vehicles:
            continue
        printed += 1
        name = str(plan.get("name", "")).strip() or f"Plan {idx}"
        lender = str(plan.get("lender", "")).strip()
        plan_label = f"{name} ({lender})" if lender else name
        max_term = _format_int(plan.get("maxTermMonths"), "meses")
        rate = _format_rate(plan.get("rate"), bool(plan.get("showRate", True)))
        lines.append(
            f"{printed}. {plan_label} - {bold_labels['Tasa']}: {rate} - {bold_labels['Plazo maximo']}: {max_term}"
        )

        requirements = plan.get("requirements")
        req_values = [
            str(item.get("title", "")).strip()
            for item in requirements
            if isinstance(item, dict) and str(item.get("title", "")).strip()
        ] if isinstance(requirements, list) else []
        if req_values:
            lines.append(f"   {bold_labels['Requisitos']}:")
            for requirement in req_values:
                lines.append(f"    - {requirement}")
        lines.append("")
    if not printed:
        return f"No encontre planes de financiamiento activos para {normalized_vehicle}."
    return "\n".join(lines).strip()


def format_financing_plan_vehicles(plan: dict[str, Any]) -> str:
    """Lista vehiculos asociados a un plan para forzar seleccion de modelo."""

    vehicles = plan.get("vehicles")
    valid = [item for item in vehicles if isinstance(item, dict)] if isinstance(vehicles, list) else []
    if not valid:
        return (
            "Este plan no tiene vehiculos vinculados directamente. "
            "Dime marca y modelo para buscar uno compatible."
        )

    lines = ["Selecciona el vehiculo que te interesa dentro de este plan:", ""]
    for idx, vehicle in enumerate(valid, start=1):
        lines.append(f"{idx}. {_vehicle_label(vehicle)}")
    return "\n".join(lines)
