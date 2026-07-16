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
from langchain_openai import ChatOpenAI
from src.utils.app_logging import get_app_logger, log_flow_trace
from src.utils.prompts import build_vehicle_filter_extraction_prompt

_price_filters_log = get_app_logger("vehicles")


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


def _vehicles_owner_params() -> dict[str, str]:
    from src.tools.database import _owner_query_params

    return _owner_query_params()


def fetch_vehicles() -> list[dict[str, Any]]:
    """Obtiene catalogo de vehiculos completo desde backend."""

    url = f"{_vehicles_api_base_url()}/vehicles"
    response = requests.get(
        url,
        headers=_vehicles_api_headers(),
        params=_vehicles_owner_params() or None,
        timeout=6,
    )
    response.raise_for_status()
    return _normalize_vehicles_payload(response.json())


def search_vehicles(filters: dict[str, Any]) -> list[dict[str, Any]]:
    """Busca vehiculos por filtros soportados por backend."""

    allowed_keys = {"brand", "model", "color", "year", "minPrice", "maxPrice"}
    params: dict[str, Any] = {}
    for key, value in filters.items():
        if key not in allowed_keys or value in (None, ""):
            continue
        params[key] = value
    url = f"{_vehicles_api_base_url()}/vehicles/search"
    owner_params = _vehicles_owner_params()
    if owner_params:
        params = {**params, **owner_params}
    response = requests.get(url, headers=_vehicles_api_headers(), params=params, timeout=6)
    response.raise_for_status()
    return _normalize_vehicles_payload(response.json())


def resolve_single_vehicle_from_text(
    user_text: str,
    *,
    prefer_available: bool,
    require_brand_or_model: bool = False,
    catalog: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """Resuelve un unico vehiculo a partir de texto libre."""

    normalized_text = str(user_text or "").strip()
    if not normalized_text:
        return None
    try:
        active_catalog = catalog if isinstance(catalog, list) else fetch_vehicles()
    except Exception:
        return None
    filters = detect_vehicle_filters(normalized_text, active_catalog)
    if require_brand_or_model and not (
        str(filters.get("brand", "")).strip() or str(filters.get("model", "")).strip()
    ):
        return None
    if not filters:
        return None
    try:
        matches = search_vehicles(filters)
    except Exception:
        return None
    candidates = [item for item in matches if isinstance(item, dict)]
    if prefer_available:
        available = [item for item in candidates if str(item.get("status", "")).strip().lower() == "available"]
        candidates = available or candidates
    if len(candidates) == 1:
        return candidates[0]
    return None


def _debug_vehicle_detail_fetch(event: str, **payload: Any) -> None:
    """Trazas de detalle de vehiculo; payload completo solo con LOG_LEVEL=debug."""

    log_flow_trace(_price_filters_log, "vehicles.detail", event, **payload)


def fetch_vehicle_by_id(vehicle_id: str) -> dict[str, Any] | None:
    """Obtiene detalle puntual del vehiculo por id."""

    cleaned_id = str(vehicle_id or "").strip()
    if not cleaned_id:
        return None
    url = f"{_vehicles_api_base_url()}/vehicles/{cleaned_id}"
    response = requests.get(
        url,
        headers=_vehicles_api_headers(),
        params=_vehicles_owner_params() or None,
        timeout=6,
    )
    if response.status_code == 404:
        _debug_vehicle_detail_fetch(
            "technical_sheet_lookup",
            vehicle_id=cleaned_id,
            found=False,
            has_technical_sheet=False,
        )
        return None
    response.raise_for_status()
    payload = response.json()
    if isinstance(payload, dict):
        technical_sheet_url = str(payload.get("technicalSheetUrl") or "").strip()
        _debug_vehicle_detail_fetch(
            "technical_sheet_lookup",
            vehicle_id=cleaned_id,
            found=True,
            has_technical_sheet=bool(technical_sheet_url),
        )
        return payload
    _debug_vehicle_detail_fetch(
        "technical_sheet_lookup",
        vehicle_id=cleaned_id,
        found=False,
        has_technical_sheet=False,
    )
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
    owner_params = _vehicles_owner_params()
    if owner_params:
        params = {**params, **owner_params}

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


def _parse_price_amount(raw_amount: str, raw_suffix: str = "") -> int | None:
    """Convierte una cantidad escrita por usuario a entero compatible con backend."""

    amount = str(raw_amount or "").strip().lower()
    suffix = str(raw_suffix or "").strip().lower()
    if not amount:
        return None
    compact = re.sub(r"\s+", "", amount).replace(",", "")
    if compact.count(".") > 1:
        compact = compact.replace(".", "")
    elif "." in compact:
        whole, frac = compact.split(".", 1)
        # Caso comun: 200.000 (separador de miles)
        if len(frac) == 3 and whole.isdigit() and frac.isdigit():
            compact = f"{whole}{frac}"
    if not re.search(r"\d", compact):
        return None
    normalized = re.sub(r"[^0-9.]", "", compact)
    if normalized.count(".") > 1:
        normalized = normalized.replace(".", "")
    try:
        value = float(normalized)
    except ValueError:
        return None
    multiplier = 1
    if suffix in {"k", "mil"}:
        multiplier = 1000
    elif suffix in {"millon", "millones"}:
        multiplier = 1_000_000
    result = int(round(value * multiplier))
    return result if result >= 0 else None


def _debug_price_filters(event: str, **payload: Any) -> None:
    """Log de filtros de precio; payload completo solo con LOG_LEVEL=debug."""

    log_flow_trace(_price_filters_log, "vehicles.price_filters", event, **payload)


def _parse_json_object_from_llm(text: str) -> dict[str, Any] | None:
    """Extrae el primer JSON objeto de la salida del modelo."""

    raw = str(text or "").strip()
    if not raw:
        return None
    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", raw, re.IGNORECASE)
    if fenced:
        raw = fenced.group(1).strip()
    if not raw.startswith("{"):
        candidate = re.search(r"\{[\s\S]*\}", raw)
        if candidate:
            raw = candidate.group(0).strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _coerce_year(value: Any) -> int | None:
    """Normaliza año a formato int válido."""

    if isinstance(value, bool) or value is None:
        return None
    try:
        year = int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None
    return year if 1900 <= year <= 2100 else None


def _coerce_price(value: Any) -> int | None:
    """Normaliza precio entero desde distintos formatos."""

    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(round(float(value))) if float(value) >= 0 else None
    raw = str(value).strip().lower()
    if not raw:
        return None
    # Soporta unidades incrustadas en el mismo valor, ej: "220k", "150 mil", "1.2 millones".
    with_suffix = re.match(r"^\s*([0-9][0-9\s\.,]*)\s*(k|mil|millon|millones)\s*$", raw)
    if with_suffix:
        parsed = _parse_price_amount(with_suffix.group(1), with_suffix.group(2))
        if parsed is not None:
            return parsed
    return _parse_price_amount(raw, "")


def _sanitize_llm_vehicle_filters(
    raw: dict[str, Any], brands: list[str], models: list[str], colors: list[str]
) -> dict[str, Any]:
    """Valida/sanitiza payload de filtros de vehículo proveniente de LLM."""

    out: dict[str, Any] = {}
    raw_brand = str(raw.get("brand") or "").strip()
    raw_model = str(raw.get("model") or "").strip()
    raw_color = str(raw.get("color") or "").strip()

    brand = canonicalize_with_typo_support(raw_brand, brands, threshold=0.72) if raw_brand else None
    model = canonicalize_with_typo_support(raw_model, models, threshold=0.7) if raw_model else None
    color = canonicalize_with_typo_support(raw_color, colors, threshold=0.75) if raw_color else None
    if brand:
        out["brand"] = brand
    if model:
        out["model"] = model
    if color:
        out["color"] = color

    year = _coerce_year(raw.get("year"))
    if year is not None:
        out["year"] = year

    min_price = _coerce_price(raw.get("minPrice"))
    max_price = _coerce_price(raw.get("maxPrice"))
    if min_price is not None:
        out["minPrice"] = min_price
    if max_price is not None:
        out["maxPrice"] = max_price
    if "minPrice" in out and "maxPrice" in out and out["minPrice"] > out["maxPrice"]:
        out["minPrice"], out["maxPrice"] = out["maxPrice"], out["minPrice"]
    return out


def _extract_filters_with_llm(
    user_text: str, *, brands: list[str], models: list[str], colors: list[str]
) -> dict[str, Any]:
    """Clasificador LLM para filtros de catálogo (con salida JSON estricta)."""

    model_name = os.getenv("MODEL_NAME", "gpt-4o-mini")
    try:
        llm = ChatOpenAI(model=model_name, temperature=0)
        prompt = build_vehicle_filter_extraction_prompt(user_text, brands=brands, models=models, colors=colors)
        content = llm.invoke(prompt).content
        parsed = _parse_json_object_from_llm(str(content or ""))
        if not parsed:
            _debug_price_filters("llm_parse_failed", model=model_name, content=str(content or "")[:200])
            return {}
        sanitized = _sanitize_llm_vehicle_filters(parsed, brands=brands, models=models, colors=colors)
        _debug_price_filters("llm_filters_detected", filters=sanitized)
        return sanitized
    except Exception as exc:
        _debug_price_filters("llm_extract_failed", model=model_name, error=str(exc))
        return {}


def _extract_price_filters(user_text: str) -> dict[str, int]:
    """Extrae minPrice/maxPrice desde lenguaje natural."""

    lowered = normalize_user_text(user_text)
    if not lowered:
        return {}
    compact_text = re.sub(r"\s+", " ", str(user_text or "").lower()).strip()
    if not compact_text:
        compact_text = lowered
    amount_pattern = r"(\d[\d\s\.,]*\d|\d)\s*(k|mil|millon|millones)?"

    def _first_value(pattern: str) -> int | None:
        match = re.search(pattern, compact_text)
        if not match:
            match = re.search(pattern, lowered)
        if not match:
            return None
        return _parse_price_amount(match.group(1), match.group(2) or "")

    # Rango explícito: entre X y Y / de X a Y.
    range_match = re.search(rf"\bentre\s+{amount_pattern}\s+y\s+{amount_pattern}\b", compact_text)
    if not range_match:
        range_match = re.search(rf"\bde\s+{amount_pattern}\s+a\s+{amount_pattern}\b", compact_text)
    if range_match:
        first = _parse_price_amount(range_match.group(1), range_match.group(2) or "")
        second = _parse_price_amount(range_match.group(3), range_match.group(4) or "")
        if first is not None and second is not None:
            min_price, max_price = sorted((first, second))
            return {"minPrice": min_price, "maxPrice": max_price}

    max_price = _first_value(rf"\b(?:hasta|maximo|máximo|menos de|no mas de)\s+{amount_pattern}\b")
    min_price = _first_value(rf"\b(?:desde|minimo|mínimo|mas de|más de|arriba de)\s+{amount_pattern}\b")
    budget_price = _first_value(rf"\b(?:presupuesto)(?:\s+maximo|\s+máximo|\s+de)?\s+{amount_pattern}\b")
    if budget_price is not None and max_price is None:
        max_price = budget_price

    filters: dict[str, int] = {}
    if min_price is not None:
        filters["minPrice"] = min_price
    if max_price is not None:
        filters["maxPrice"] = max_price
    if "minPrice" in filters and "maxPrice" in filters and filters["minPrice"] > filters["maxPrice"]:
        filters["minPrice"], filters["maxPrice"] = filters["maxPrice"], filters["minPrice"]
    return filters


_REQUIREMENT_METADATA_KEYS = (
    "passengers",
    "doors",
    "fuel",
    "drivetrain",
    "versions",
    "transmissionFull",
)


def build_vehicle_requirement_catalog_block(vehicles: list[dict[str, Any]]) -> str:
    """Serializa catálogo compacto (id, nombre, description, metadata útil) para matching LLM."""

    lines: list[str] = []
    for item in vehicles:
        if not isinstance(item, dict):
            continue
        vehicle_id = str(item.get("id", "")).strip()
        if not vehicle_id:
            continue
        brand = str(item.get("brand", "")).strip()
        model = str(item.get("model", "")).strip()
        year = item.get("year")
        year_suffix = f" {year}" if isinstance(year, int) else ""
        name = f"{brand} {model}{year_suffix}".strip() or "Sin nombre"
        status = str(item.get("status", "")).strip() or "unknown"
        price_value = _coerce_price(item.get("price"))
        price_text = str(price_value) if price_value is not None else "N/D"
        description = str(item.get("description", "")).strip() or "(sin descripcion)"
        meta_parts: list[str] = []
        metadata = item.get("metadata")
        if isinstance(metadata, dict):
            for key in _REQUIREMENT_METADATA_KEYS:
                if key not in metadata:
                    continue
                value = metadata.get(key)
                if value in (None, ""):
                    continue
                meta_parts.append(f"{key}={value}")
        transmission = str(item.get("transmission", "")).strip()
        engine = str(item.get("engine", "")).strip()
        if transmission:
            meta_parts.append(f"transmission={transmission}")
        if engine:
            meta_parts.append(f"engine={engine}")
        meta_text = "; ".join(meta_parts) if meta_parts else "(sin metadata)"
        lines.append(
            f"- id={vehicle_id} | name={name} | status={status} | price={price_text} | "
            f"description={description} | metadata={meta_text}"
        )
    return "\n".join(lines) if lines else "(sin vehiculos)"


def detect_vehicle_filters(user_text: str, vehicles: list[dict[str, Any]]) -> dict[str, Any]:
    """Extrae filtros brand/model/color/year/precio con clasificador LLM + heurística."""

    normalized = normalize_user_text(user_text)
    filters: dict[str, Any] = {}
    if not normalized:
        return filters

    brands = sorted(
        {str(item.get("brand", "")).strip() for item in vehicles if str(item.get("brand", "")).strip()}
    )
    models = sorted(
        {str(item.get("model", "")).strip() for item in vehicles if str(item.get("model", "")).strip()}
    )
    colors = sorted(
        {str(item.get("color", "")).strip() for item in vehicles if str(item.get("color", "")).strip()}
    )
    llm_filters = _extract_filters_with_llm(user_text, brands=brands, models=models, colors=colors)
    filters.update(llm_filters)

    price_filters = _extract_price_filters(user_text)
    _debug_price_filters(
        "price_detected_heuristic",
        user_text=user_text,
        minPrice=price_filters.get("minPrice"),
        maxPrice=price_filters.get("maxPrice"),
        hasRange=bool(price_filters.get("minPrice") is not None and price_filters.get("maxPrice") is not None),
    )
    if "year" not in filters:
        years = re.findall(r"\b(?:19|20)\d{2}\b", normalized)
        if years:
            selected_year = int(years[-1])
            price_values = {int(v) for v in price_filters.values() if isinstance(v, int)}
            price_hints_present = any(
                hint in normalized
                for hint in (
                    "precio",
                    "presupuesto",
                    "entre",
                    "desde",
                    "hasta",
                    "maximo",
                    "minimo",
                    "menos de",
                    "mas de",
                )
            )
            references_model_year = bool(re.search(r"\b(ano|año|modelo)\b", normalized))
            if not (price_hints_present and selected_year in price_values and not references_model_year):
                filters["year"] = selected_year

    if "brand" not in filters:
        brand = canonicalize_with_typo_support(user_text, brands, threshold=0.78)
        if brand:
            filters["brand"] = brand
    if "model" not in filters:
        model = canonicalize_with_typo_support(user_text, models, threshold=0.76)
        if model:
            filters["model"] = model
    if "color" not in filters:
        color = canonicalize_with_typo_support(user_text, colors, threshold=0.8)
        if color:
            filters["color"] = color
    if "minPrice" not in filters and "minPrice" in price_filters:
        filters["minPrice"] = price_filters["minPrice"]
    if "maxPrice" not in filters and "maxPrice" in price_filters:
        filters["maxPrice"] = price_filters["maxPrice"]
    _debug_price_filters("filters_detected", filters=filters)

    return filters


def notify_advisor(
    selected_car: str,
    customer_info: dict[str, Any],
    owner_user_id: str,
    financing_selection: dict[str, Any] | None = None,
    promotion_selection: dict[str, Any] | None = None,
    *,
    push_title: str | None = None,
    push_body: str | None = None,
    notification_kind: str = "lead_interest",
    conversation_id: str | None = None,
) -> bool:
    """Envia push al owner via backend API `/bot/push-notify`.

    Por defecto notifica un lead de vehiculo. Con push_title y push_body se puede
    personalizar el mensaje (p. ej. solicitud de asesor humano).
    """

    normalized_owner_user_id = str(owner_user_id or "").strip()
    if not normalized_owner_user_id:
        return False

    endpoint = f"{_vehicles_api_base_url()}/bot/push-notify"
    customer_name = str(customer_info.get("nombre", "")).strip()
    customer_phone = str(customer_info.get("telefono", "")).strip()
    customer_email = str(customer_info.get("email", "")).strip()
    normalized_financing = financing_selection or {}
    normalized_promotion = promotion_selection or {}
    if push_title and push_body:
        title = str(push_title).strip()
        body = str(push_body).strip()
    else:
        title = "Nuevo lead interesado en vehiculo"
        body = (
            f"{customer_name or 'Cliente'} quiere informacion de {selected_car}. "
            f"Telefono: {customer_phone or 'N/D'}."
        )
    payload = {
        "owner_user_id": normalized_owner_user_id,
        "title": title,
        "body": body,
        "data": {
            "notification_kind": str(notification_kind or "lead_interest").strip(),
            "selected_car": str(selected_car or "").strip(),
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "customer_email": customer_email,
            "financing_selection": json.dumps(normalized_financing, ensure_ascii=True, separators=(",", ":")),
            "promotion_selection": json.dumps(normalized_promotion, ensure_ascii=True, separators=(",", ":")),
        },
    }
    normalized_conversation_id = str(conversation_id or "").strip()
    if normalized_conversation_id:
        payload["data"]["conversationId"] = normalized_conversation_id
    headers = {
        **_vehicles_api_headers(),
        "Content-Type": "application/json",
    }
    try:
        response = requests.post(endpoint, json=payload, headers=headers, timeout=6)
        response.raise_for_status()
        return True
    except requests.RequestException as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", None)
        response_text = ""
        if getattr(exc, "response", None) is not None:
            response_text = str(exc.response.text or "").strip()
        print(
            "[notify_advisor] push request failed",
            {
                "endpoint": endpoint,
                "status_code": status_code,
                "owner_user_id": normalized_owner_user_id,
                "error": str(exc),
                "response": response_text[:300],
            },
        )
        raise
