"""Formateadores de texto para respuestas de catalogo de vehiculos."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any, Callable

# Etiquetas legibles para keys comunes de metadata (import Suzuki / ConfigProductos).
_METADATA_LABELS: dict[str, str] = {
    "lengthMm": "Longitud total",
    "widthMm": "Ancho total",
    "heightMm": "Altura total",
    "wheelbaseMm": "Distancia entre ejes",
    "fuelCityKmL": "Rendimiento ciudad",
    "fuelHighwayKmL": "Rendimiento carretera",
    "fuelCombinedKmL": "Rendimiento combinado",
    "passengers": "Pasajeros",
    "doors": "Puertas",
    "fuel": "Combustible",
    "drivetrain": "Tracción",
    "versions": "Versiones",
    "transmissionFull": "Transmisión completa",
}

_DIMENSION_METADATA_KEYS = frozenset(
    {
        "lengthMm",
        "widthMm",
        "heightMm",
        "wheelbaseMm",
    }
)

_DIMENSION_LABEL_HINTS = (
    "longitud",
    "ancho",
    "altura",
    "entre ejes",
    "dimensi",
    "medida",
    "tamaño",
    "tamano",
)


def _title_or_default(value: Any, fallback: str = "N/D") -> str:
    """Helper de apoyo para title or default."""
    text = str(value or "").strip()
    if not text:
        return fallback
    return text.title()


def _format_currency(value: Any) -> str:
    """Formatea currency para salida de chat."""
    raw = str(value or "").strip()
    if not raw:
        return "N/D"
    try:
        amount = Decimal(raw)
    except (InvalidOperation, ValueError):
        return raw
    return f"${amount:,.2f}"


def _format_int(value: Any, suffix: str = "") -> str:
    """Formatea int para salida de chat."""
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return "N/D"
    if suffix:
        return f"{parsed:,} {suffix}".strip()
    return f"{parsed:,}"


def _is_zero_km(value: Any) -> bool:
    """True cuando el kilometraje registrado es exactamente cero (unidad nueva)."""
    try:
        return int(value) == 0
    except (TypeError, ValueError):
        return False


def _status_label(status: Any) -> str:
    """Helper de apoyo para status label."""
    normalized = str(status or "").strip().lower()
    mapping = {
        "available": "Disponible",
        "reserved": "Reservado",
        "sold": "Vendido",
    }
    return mapping.get(normalized, _title_or_default(status))


def _bold_label(text: str, platform: str) -> str:
    """Helper de apoyo para bold label."""
    normalized_platform = str(platform or "web").strip().lower()
    marker = "*" if normalized_platform == "whatsapp" else "**"
    return f"{marker}{text}{marker}"


def _bold_labels(labels: list[str], platform: str = "web") -> dict[str, str]:
    """Devuelve un mapa etiqueta->etiqueta en negritas para reutilizar formateo."""

    return {label: _bold_label(label, platform) for label in labels}


def _metadata_key_label(key: str) -> str:
    """Convierte key de metadata a etiqueta legible (mapa conocido o camelCase/snake_case)."""

    raw = str(key or "").strip()
    if not raw:
        return ""
    mapped = _METADATA_LABELS.get(raw)
    if mapped:
        return mapped
    # Keys libres de UI ya suelen venir en español title-case.
    if " " in raw or (raw[:1].isupper() and not raw.isupper() and "_" not in raw and not re.search(r"[a-z][A-Z]", raw)):
        return raw
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", raw.replace("_", " "))
    spaced = re.sub(r"\s+", " ", spaced).strip()
    if not spaced:
        return raw
    return spaced[:1].upper() + spaced[1:]


def _format_metadata_value(value: Any) -> str:
    """Stringify limpio de un valor de metadata para el bloque DATOS_VERIFICADOS."""

    if value is None:
        return ""
    if isinstance(value, bool):
        return "sí" if value else "no"
    if isinstance(value, (int, float)):
        if isinstance(value, float) and value == int(value):
            return str(int(value))
        return str(value)
    if isinstance(value, list):
        parts = [_format_metadata_value(item) for item in value]
        parts = [part for part in parts if part]
        return ", ".join(parts)
    if isinstance(value, dict):
        parts = []
        for nested_key, nested_value in value.items():
            nested_text = _format_metadata_value(nested_value)
            if not nested_text:
                continue
            label = _metadata_key_label(str(nested_key))
            parts.append(f"{label}: {nested_text}" if label else nested_text)
        return "; ".join(parts)
    return str(value).strip()


def _is_dimension_metadata_key(key: str, label: str) -> bool:
    """True si la key/etiqueta de metadata corresponde a dimensiones del vehiculo."""

    raw_key = str(key or "").strip()
    if raw_key in _DIMENSION_METADATA_KEYS:
        return True
    haystack = f"{raw_key} {label}".strip().lower()
    if not haystack:
        return False
    return any(hint in haystack for hint in _DIMENSION_LABEL_HINTS)


def _format_metadata_lines(
    metadata: Any,
    platform: str = "web",
    *,
    include_dimensions: bool = False,
) -> list[str]:
    """Arma lineas Etiqueta: valor desde vehicle.metadata (información adicional)."""

    if not isinstance(metadata, dict) or not metadata:
        return []
    lines: list[str] = []
    for key, value in metadata.items():
        label = _metadata_key_label(str(key))
        text = _format_metadata_value(value)
        if not label or not text:
            continue
        if not include_dimensions and _is_dimension_metadata_key(str(key), label):
            continue
        lines.append(f"{_bold_label(label, platform)}: {text}")
    return lines


def format_vehicle_name(item: dict[str, Any]) -> str:
    """Compone nombre legible `marca modelo año` para mensajes."""

    brand = str(item.get("brand", "")).strip()
    model = str(item.get("model", "")).strip()
    year = item.get("year")
    suffix = f" {year}" if isinstance(year, int) else ""
    return f"{brand} {model}{suffix}".strip()


def _outbound_priority_value(item: dict[str, Any]) -> int:
    """Lee prioridad de envío; 0 significa sin prioridad explícita."""

    try:
        return int(item.get("outboundPriority", 0) or 0)
    except (TypeError, ValueError):
        return 0


def sort_vehicles_by_outbound_priority(vehicles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Ordena vehículos por prioridad de envío ASC (1 primero); sin prioridad al final."""

    valid = [item for item in vehicles if isinstance(item, dict)]

    def sort_key(item: dict[str, Any]) -> tuple[int, int, str]:
        priority = _outbound_priority_value(item)
        if priority <= 0:
            return (1, 0, format_vehicle_name(item).lower())
        return (0, priority, format_vehicle_name(item).lower())

    return sorted(valid, key=sort_key)


def format_candidate_options(candidates: list[dict[str, Any]], limit: int = 8) -> str:
    """Construye una lista numerada breve para que el usuario elija una opción."""

    lines: list[str] = []
    for idx, item in enumerate(candidates[:limit], start=1):
        if not isinstance(item, dict):
            continue
        label = format_vehicle_name(item)
        if label:
            lines.append(f"{idx}. {label}")
    return "\n".join(lines)


def format_images_bulleted_list(images: list[str], resolve_url_fn: Callable[[str], str]) -> str:
    """Formatea bloque de imágenes con bullets y URLs ya resueltas."""

    formatted = "\n".join(f"- {resolve_url_fn(str(url or ''))}" for url in images)
    return f"Imagenes del vehiculo:\n{formatted}"


def format_available_vehicles_grouped(vehicles: list[dict[str, Any]]) -> str:
    """Agrupa disponibles por marca; un modelo por linea.

    Si todos los vehiculos son de la misma marca, omite el nombre de la marca.
    Si un modelo tiene varios anios, lista cada anio en su propia linea.
    """

    available = [
        item
        for item in sort_vehicles_by_outbound_priority(vehicles)
        if str(item.get("status", "")).strip().lower() == "available"
    ]
    if not available:
        return "No tengo vehiculos disponibles en este momento. Si quieres, puedo ayudarte a buscar por otra caracteristica."

    # brand -> modelos en orden de aparicion (prioridad outbound ya aplicada)
    brands: dict[str, list[str]] = {}
    seen_per_brand: dict[str, set[str]] = {}
    for item in available:
        brand = _title_or_default(item.get("brand"), fallback="")
        model = _title_or_default(item.get("model"), fallback="")
        if not brand or not model:
            continue
        year = item.get("year")
        label = model
        if isinstance(year, int) and str(year) not in model:
            label = f"{model} {year}"
        if brand not in brands:
            brands[brand] = []
            seen_per_brand[brand] = set()
        key = label.lower()
        if key in seen_per_brand[brand]:
            continue
        seen_per_brand[brand].add(key)
        brands[brand].append(label)

    if not brands:
        return "No tengo vehiculos disponibles en este momento. Si quieres, puedo ayudarte a buscar por otra caracteristica."

    omit_brand = len(brands) == 1
    lines: list[str] = []
    for brand, models in brands.items():
        if omit_brand:
            for model in models:
                lines.append(f"🚗 {model}")
        else:
            lines.append(f"🚗 {brand}:")
            for model in models:
                lines.append(f"• {model}")

    return "\n".join(lines)


def format_filtered_vehicles(vehicles: list[dict[str, Any]], platform: str = "web") -> str:
    """Presenta resultados de filtros en una sola linea por vehiculo."""

    if not vehicles:
        return "No encontre vehiculos que coincidan con esas caracteristicas. Si quieres, probamos con otra combinacion."

    lines = [f"Tenemos estos modelos con las caracteristicas que estas buscando 😊🚗", ""]
    for item in sort_vehicles_by_outbound_priority(vehicles):
        brand = _title_or_default(item.get("brand"))
        model = _title_or_default(item.get("model"))
        year = item.get("year")
        one_line = f"{brand} {model}".strip()
        if isinstance(year, int) and str(year) not in model:
            one_line = f"{one_line} {year}".strip()
        lines.append(f"🚗 {one_line}")
    return "\n".join(lines).strip()


def format_vehicle_detail(
    vehicle: dict[str, Any],
    platform: str = "web",
    *,
    include_color: bool = False,
    include_dimensions: bool = False,
) -> str:
    """Construye detalle del vehiculo en lista vertical corta."""

    brand = _title_or_default(vehicle.get("brand"))
    model = _title_or_default(vehicle.get("model"))
    year = vehicle.get("year")
    description = str(vehicle.get("description", "")).strip()

    lines = [
        f"{_bold_label('Marca', platform)}: {brand}",
        f"{_bold_label('Modelo', platform)}: {model}",
        f"{_bold_label('Año', platform)}: {year if isinstance(year, int) else 'N/D'}",
        f"{_bold_label('Precio', platform)}: a partir de {_format_currency(vehicle.get('price'))}",
    ]
    km_value = vehicle.get("km")
    if _is_zero_km(km_value):
        lines.append(f"{_bold_label('Estado', platform)}: Nuevo")
    else:
        lines.append(f"{_bold_label('Kilometraje', platform)}: {_format_int(km_value, 'km')}")
    lines.extend(
        [
            f"{_bold_label('Transmisión', platform)}: {_title_or_default(vehicle.get('transmission'))}",
            f"{_bold_label('Motor', platform)}: {_title_or_default(vehicle.get('engine'))}",
        ]
    )
    if include_color:
        lines.append(f"{_bold_label('Color', platform)}: {_title_or_default(vehicle.get('color'))}")
    if description:
        lines.append(f"{_bold_label('Descripción', platform)}: {description}")
    lines.extend(
        _format_metadata_lines(
            vehicle.get("metadata"),
            platform,
            include_dimensions=include_dimensions,
        )
    )
    return "\n".join(lines)


def format_two_vehicle_comparison_grounding(
    vehicle_a: dict[str, Any],
    vehicle_b: dict[str, Any],
    platform: str = "web",
    *,
    include_color: bool = False,
    include_dimensions: bool = False,
) -> str:
    """Une dos fichas `format_vehicle_detail` para anclar narrativa de comparacion al LLM."""

    if not isinstance(vehicle_a, dict) or not isinstance(vehicle_b, dict):
        return ""
    name_a = format_vehicle_name(vehicle_a)
    name_b = format_vehicle_name(vehicle_b)
    block_a = format_vehicle_detail(
        vehicle_a,
        platform=platform,
        include_color=include_color,
        include_dimensions=include_dimensions,
    )
    block_b = format_vehicle_detail(
        vehicle_b,
        platform=platform,
        include_color=include_color,
        include_dimensions=include_dimensions,
    )
    return (
        f"VEHICULO_A ({name_a}):\n{block_a}\n\n"
        f"VEHICULO_B ({name_b}):\n{block_b}"
    )


def format_financing_plan_comparison(
    plan_a: dict[str, Any],
    plan_b: dict[str, Any],
    platform: str = "web",
) -> str:
    """Compara dos planes de financiamiento en filas paralelas."""

    def _req_line(plan: dict[str, Any]) -> str:
        requirements = plan.get("requirements")
        req_values = [
            str(item.get("title", "")).strip()
            for item in requirements
            if isinstance(item, dict) and str(item.get("title", "")).strip()
        ] if isinstance(requirements, list) else []
        return ", ".join(req_values) if req_values else "N/D"

    def _veh_line(plan: dict[str, Any]) -> str:
        avail = _available_plan_vehicles(plan)
        labels = [_vehicle_label(v) for v in avail]
        return "; ".join(labels) if labels else "N/D"

    bold = _bold_labels(["Plan", "Financiera", "Tasa", "Plazo maximo", "Requisitos", "Vehiculos"], platform)

    def _name(plan: dict[str, Any], idx: int) -> str:
        n = str(plan.get("name", "")).strip() or f"Plan {idx}"
        return n

    rows = [
        f"{bold['Plan']}: {_name(plan_a, 1)} | {_name(plan_b, 2)}",
        (
            f"{bold['Financiera']}: "
            f"{str(plan_a.get('lender', '')).strip() or 'N/D'} | "
            f"{str(plan_b.get('lender', '')).strip() or 'N/D'}"
        ),
        (
            f"{bold['Tasa']}: "
            f"{_format_rate(plan_a.get('rate'), bool(plan_a.get('showRate', True)))} | "
            f"{_format_rate(plan_b.get('rate'), bool(plan_b.get('showRate', True)))}"
        ),
        (
            f"{bold['Plazo maximo']}: "
            f"{_format_int(plan_a.get('maxTermMonths'), 'meses')} | "
            f"{_format_int(plan_b.get('maxTermMonths'), 'meses')}"
        ),
        f"{bold['Requisitos']}: {_req_line(plan_a)} | {_req_line(plan_b)}",
        f"{bold['Vehiculos']}: {_veh_line(plan_a)} | {_veh_line(plan_b)}",
    ]
    return "\n".join(["Comparacion de planes de financiamiento:", "", *rows])


def format_promotion_comparison(
    promo_a: dict[str, Any],
    promo_b: dict[str, Any],
    platform: str = "web",
) -> str:
    """Compara dos promociones en filas paralelas."""

    bold = _bold_labels(["Titulo", "Descripcion", "Vigencia", "Vehiculos aplicables"], platform)

    def _title(p: dict[str, Any], fallback: str) -> str:
        return str(p.get("title", "")).strip() or fallback

    def _desc(p: dict[str, Any]) -> str:
        return str(p.get("description", "")).strip() or "Sin descripcion"

    def _until(p: dict[str, Any]) -> str:
        u = str(p.get("validUntil", "")).strip()
        return u or "Sin fecha de expiracion"

    def _vlabels(p: dict[str, Any]) -> str:
        vehicle_labels = p.get("vehicleLabels")
        vals = [
            str(label).strip()
            for label in vehicle_labels
            if str(label).strip()
        ] if isinstance(vehicle_labels, list) else []
        return ", ".join(vals) if vals else "N/D"

    rows = [
        f"{bold['Titulo']}: {_title(promo_a, 'A')} | {_title(promo_b, 'B')}",
        f"{bold['Descripcion']}: {_desc(promo_a)} | {_desc(promo_b)}",
        f"{bold['Vigencia']}: {_until(promo_a)} | {_until(promo_b)}",
        f"{bold['Vehiculos aplicables']}: {_vlabels(promo_a)} | {_vlabels(promo_b)}",
    ]
    return "\n".join(["Comparacion de promociones:", "", *rows])


def _format_rate(rate: Any, show_rate: bool = True) -> str:
    """Formatea rate para salida de chat."""
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
    """Helper de apoyo para vehicle label."""
    brand = _title_or_default(vehicle.get("brand"))
    model = _title_or_default(vehicle.get("model"))
    year = vehicle.get("year")
    if isinstance(year, int):
        return f"{brand} {model} {year}"
    return f"{brand} {model}".strip()


def _available_plan_vehicles(plan: dict[str, Any]) -> list[dict[str, Any]]:
    """Helper de apoyo para available plan vehicles."""
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


def format_promotions(promotions: list[dict[str, Any]], platform: str = "web") -> str:
    """Lista promociones activas con titulo, descripcion y vigencia."""

    active_promotions = [item for item in promotions if isinstance(item, dict) and bool(item.get("active", True))]
    if not active_promotions:
        return "No hay promociones disponibles en este momento."
    bold_labels = _bold_labels(["Titulo", "Descripcion", "Vigencia", "Vehiculos aplicables"], platform)
    lines = ["Estas son las promociones disponibles:", ""]
    printed = 0
    for item in active_promotions:
        title = str(item.get("title", "")).strip()
        description = str(item.get("description", "")).strip()
        valid_until = str(item.get("validUntil", "")).strip()
        if not title:
            continue
        printed += 1
        lines.append(f"{printed}. {_bold_label(title, platform)}")
        lines.append(f"   - {description or 'Sin descripcion'}")
        lines.append(f"   - {bold_labels['Vigencia']}: {valid_until or 'Sin fecha de expiracion'}")
        vehicle_labels = item.get("vehicleLabels")
        valid_vehicle_labels = [
            str(label).strip()
            for label in vehicle_labels
            if str(label).strip()
        ] if isinstance(vehicle_labels, list) else []
        if valid_vehicle_labels:
            lines.append(f"   - {bold_labels['Vehiculos aplicables']}:")
            for label in valid_vehicle_labels:
                lines.append(f"     - {label}")
        lines.append("")
    if not printed:
        return "No hay promociones disponibles en este momento."
    return "\n".join(lines).strip()
