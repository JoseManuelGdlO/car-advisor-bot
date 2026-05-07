"""Formateadores de texto para respuestas de catalogo de vehiculos."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal, InvalidOperation
from typing import Any, Callable


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


def format_vehicle_name(item: dict[str, Any]) -> str:
    """Compone nombre legible `marca modelo año` para mensajes."""

    brand = str(item.get("brand", "")).strip()
    model = str(item.get("model", "")).strip()
    year = item.get("year")
    suffix = f" {year}" if isinstance(year, int) else ""
    return f"{brand} {model}{suffix}".strip()


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


def format_filtered_vehicles(vehicles: list[dict[str, Any]], platform: str = "web") -> str:
    """Presenta resultados de filtros en una sola linea por vehiculo."""

    if not vehicles:
        return "No encontre vehiculos que coincidan con esas caracteristicas. Si quieres, probamos con otra combinacion."

    vehicle_label = _bold_label("Modelos", platform)
    lines = [f"Tenemos estos modelos con las caracteristicas que estas buscando 😊🚗", ""]
    for item in vehicles:
        brand = _title_or_default(item.get("brand"))
        model = _title_or_default(item.get("model"))
        year = item.get("year")
        one_line = f"{brand} {model}".strip()
        if isinstance(year, int):
            one_line = f"{one_line} {year}".strip()
        lines.append(f"🚗 {vehicle_label}: {_bold_label(one_line, platform)}")
    return "\n".join(lines).strip()


def format_vehicle_detail(vehicle: dict[str, Any], platform: str = "web") -> str:
    """Construye detalle del vehiculo en lista vertical corta."""

    brand = _title_or_default(vehicle.get("brand"))
    model = _title_or_default(vehicle.get("model"))
    year = vehicle.get("year")
    description = str(vehicle.get("description", "")).strip() or "Sin descripcion disponible"

    lines = [
        f"{_bold_label('Marca', platform)}: {brand}",
        f"{_bold_label('Modelo', platform)}: {model}",
        f"{_bold_label('Año', platform)}: {year if isinstance(year, int) else 'N/D'}",
        f"{_bold_label('Precio', platform)}: {_format_currency(vehicle.get('price'))}",
        f"{_bold_label('Kilometraje', platform)}: {_format_int(vehicle.get('km'), 'km')}",
        f"{_bold_label('Transmisión', platform)}: {_title_or_default(vehicle.get('transmission'))}",
        f"{_bold_label('Motor', platform)}: {_title_or_default(vehicle.get('engine'))}",
        f"{_bold_label('Color', platform)}: {_title_or_default(vehicle.get('color'))}",
        f"{_bold_label('Descripción', platform)}: {description}",
    ]
    return "\n".join(lines)


def format_vehicle_comparison_table(
    vehicle_a: dict[str, Any],
    vehicle_b: dict[str, Any],
    platform: str = "web",
) -> str:
    """Compara dos fichas de vehiculo en filas (atributo / A / B)."""

    def _row(label: str, val_a: str, val_b: str) -> str:
        bl = _bold_label(label, platform)
        return f"{bl}: {val_a} | {val_b}"

    def _field_values(vehicle: dict[str, Any], field: str) -> str:
        if field == "brand":
            return _title_or_default(vehicle.get("brand"))
        if field == "model":
            return _title_or_default(vehicle.get("model"))
        if field == "year":
            y = vehicle.get("year")
            return str(y) if isinstance(y, int) else "N/D"
        if field == "price":
            return _format_currency(vehicle.get("price"))
        if field == "km":
            return _format_int(vehicle.get("km"), "km")
        if field == "transmission":
            return _title_or_default(vehicle.get("transmission"))
        if field == "engine":
            return _title_or_default(vehicle.get("engine"))
        if field == "color":
            return _title_or_default(vehicle.get("color"))
        if field == "status":
            return _status_label(vehicle.get("status"))
        if field == "description":
            text = str(vehicle.get("description", "")).strip()
            return text or "Sin descripcion disponible"
        return "N/D"

    title_a = _vehicle_label(vehicle_a) if isinstance(vehicle_a, dict) else "A"
    title_b = _vehicle_label(vehicle_b) if isinstance(vehicle_b, dict) else "B"
    header = _row("Vehiculo", title_a, title_b)
    rows = [
        _row("Marca", _field_values(vehicle_a, "brand"), _field_values(vehicle_b, "brand")),
        _row("Modelo", _field_values(vehicle_a, "model"), _field_values(vehicle_b, "model")),
        _row("Año", _field_values(vehicle_a, "year"), _field_values(vehicle_b, "year")),
        _row("Precio", _field_values(vehicle_a, "price"), _field_values(vehicle_b, "price")),
        _row("Kilometraje", _field_values(vehicle_a, "km"), _field_values(vehicle_b, "km")),
        _row("Transmision", _field_values(vehicle_a, "transmission"), _field_values(vehicle_b, "transmission")),
        _row("Motor", _field_values(vehicle_a, "engine"), _field_values(vehicle_b, "engine")),
        _row("Color", _field_values(vehicle_a, "color"), _field_values(vehicle_b, "color")),
        _row("Estado", _field_values(vehicle_a, "status"), _field_values(vehicle_b, "status")),
        _row("Descripcion", _field_values(vehicle_a, "description"), _field_values(vehicle_b, "description")),
    ]
    return "\n".join(["Comparacion lado a lado:", "", header, *rows])


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
