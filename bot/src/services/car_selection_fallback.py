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


def is_cheapest_price_request(user_text: str, cheapest_signals_normalized: set[str]) -> bool:
    """Detecta preguntas por el vehiculo mas barato/economico/accesible."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return any(signal in normalized for signal in cheapest_signals_normalized)


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


def is_first_images_request(
    user_text: str,
    first_images_signals_normalized: set[str],
    *,
    more_images_signals_normalized: set[str] | None = None,
) -> bool:
    """Detecta pedido explícito de ver fotos/imágenes por primera vez (no paginación)."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    if more_images_signals_normalized and is_more_images_request(user_text, more_images_signals_normalized):
        return False
    more_markers = ("mas ", "más ", "siguientes ", "otras fotos", "otras imagenes")
    if any(marker in normalized for marker in more_markers):
        return False
    return any(signal in normalized for signal in first_images_signals_normalized)


_TEST_DRIVE_LOOSE_RE = re.compile(
    r"\b(?:"
    r"pru[eb]+\w*(?:\s+(?:de\s+)?manej\w*)?"
    r"|agendar\s+pru[eb]+\w*"
    r"|quiero\s+(?:una\s+)?pru[eb]+\w*(?:\s+(?:de\s+)?manej\w*)?"
    r"|agendar\s+(?:una\s+)?cita\b"
    r"|quiero\s+agendar\s+(?:una\s+)?cita\b"
    r")\b"
)
_IN_PERSON_VISIT_LOOSE_RE = re.compile(
    r"\b(?:ver\w*\s+en\s+persona|visita\s+en\s+persona)\b"
)

# Pedido de direccion/ubicacion con proposito de ir/visitar (ej. "me pasa direccion para ir").
_LOCATION_TERM = (
    r"(?:direccion(?:es)?|ubicacion|ubicad[oa]s?|"
    r"donde\s+(?:estan|quedan|se\s+encuentran|los\s+(?:encuentro|ubico)))"
)
_VISIT_PURPOSE = (
    r"(?:para\s+ir|para\s+visitar|para\s+llegar|quiero\s+ir|voy\s+(?:a\s+)?(?:ir|pasar)|"
    r"ir\s+a\s+(?:ver|visitar)|pasarme|pasar\s+a\s+ver|como\s+llego)"
)
_LOCATION_FOR_VISIT_RE = re.compile(
    rf"(?:{_LOCATION_TERM}.{{0,48}}?{_VISIT_PURPOSE}|{_VISIT_PURPOSE}.{{0,48}}?{_LOCATION_TERM})"
)


def is_location_for_visit_request(user_text: str) -> bool:
    """True si pide direccion/ubicacion con intencion explicita de ir o visitar."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return bool(_LOCATION_FOR_VISIT_RE.search(normalized))


def is_test_drive_or_visit_request(
    user_text: str,
    test_drive_visit_signals_normalized: set[str],
) -> bool:
    """Detecta interes en prueba de manejo o visita en persona (tolera typos leves)."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    if any(contains_signal_phrase(normalized, signal) for signal in test_drive_visit_signals_normalized):
        return True
    if is_location_for_visit_request(user_text):
        return True
    return bool(_TEST_DRIVE_LOOSE_RE.search(normalized) or _IN_PERSON_VISIT_LOOSE_RE.search(normalized))


def is_financing_request(user_text: str, financing_signals_normalized: set[str]) -> bool:
    """Detecta preguntas de financiamiento con señales normalizadas."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return any(contains_signal_phrase(normalized, signal) for signal in financing_signals_normalized)


_AUTOMATIC_TRANSMISSION_SIGNALS: tuple[str, ...] = (
    "automatico",
    "automatica",
    "caja automatica",
    "transmision automatica",
    "cvt",
    "ta",
)

_STANDARD_TRANSMISSION_SIGNALS: tuple[str, ...] = (
    "estandar",
    "manual",
    "caja manual",
    "transmision manual",
    "stick",
)

_CONTADO_PAYMENT_SIGNALS: tuple[str, ...] = (
    "contado",
    "de contado",
    "efectivo",
    "cash",
    "pago de contado",
)

_FINANCIADO_PAYMENT_SIGNALS: tuple[str, ...] = (
    "financiado",
    "financiamiento",
    "financiar",
    "a credito",
    "credito",
    "a meses",
    "mensualidades",
)


def detect_transmission_preference(user_text: str) -> str | None:
    """Detecta preferencia de transmision: automatico, estandar, conflict o None."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return None
    has_auto = any(contains_signal_phrase(normalized, signal) for signal in _AUTOMATIC_TRANSMISSION_SIGNALS)
    has_standard = any(contains_signal_phrase(normalized, signal) for signal in _STANDARD_TRANSMISSION_SIGNALS)
    if has_auto and has_standard:
        return "conflict"
    if has_auto:
        return "automatico"
    if has_standard:
        return "estandar"
    return None


def detect_payment_type_preference(user_text: str) -> str | None:
    """Detecta preferencia de pago: contado, financiado, conflict o None."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return None
    has_contado = any(contains_signal_phrase(normalized, signal) for signal in _CONTADO_PAYMENT_SIGNALS)
    has_financiado = any(contains_signal_phrase(normalized, signal) for signal in _FINANCIADO_PAYMENT_SIGNALS)
    if has_contado and has_financiado:
        return "conflict"
    if has_contado:
        return "contado"
    if has_financiado:
        return "financiado"
    return None


_WHATSAPP_CONTACT_SIGNALS: tuple[str, ...] = (
    "whatsapp",
    "whats app",
    "wsp",
    "wasap",
    "ws",
    "wa",
    "por aqui",
    "por mensaje",
    "por este chat",
    "por este medio",
    "por este canal",
    "escribeme",
    "escriba me",
    "mandame mensaje",
    "mensaje de texto",
)

_CALL_CONTACT_SIGNALS: tuple[str, ...] = (
    "llamada",
    "llamar",
    "llamenme",
    "llameme",
    "me llamen",
    "por telefono",
    "telefono",
    "call",
    "phone",
)

_APPOINTMENT_CONTACT_SIGNALS: tuple[str, ...] = (
    "cita",
    "agendar",
    "agendar cita",
    "agendar una cita",
    "quiero cita",
    "visita",
    "visitar",
    "en persona",
    "prueba de manejo",
    "test drive",
)


def detect_contact_method(user_text: str) -> str | None:
    """Detecta preferencia de contacto: whatsapp, call, appointment, conflict o None."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return None
    has_whatsapp = any(contains_signal_phrase(normalized, signal) for signal in _WHATSAPP_CONTACT_SIGNALS)
    has_call = any(contains_signal_phrase(normalized, signal) for signal in _CALL_CONTACT_SIGNALS)
    has_appointment = any(
        contains_signal_phrase(normalized, signal) for signal in _APPOINTMENT_CONTACT_SIGNALS
    )
    # Prueba/visita sueltas también cuentan como cita (misma semántica que scheduling).
    if not has_appointment and (
        _TEST_DRIVE_LOOSE_RE.search(normalized)
        or _IN_PERSON_VISIT_LOOSE_RE.search(normalized)
        or is_location_for_visit_request(user_text)
    ):
        has_appointment = True
    hits = sum(1 for flag in (has_whatsapp, has_call, has_appointment) if flag)
    if hits > 1:
        return "conflict"
    if has_whatsapp:
        return "whatsapp"
    if has_call:
        return "call"
    if has_appointment:
        return "appointment"
    return None


_COLOR_QUESTION_SIGNALS: tuple[str, ...] = (
    "color",
    "de que color",
    "que color",
    "cual color",
    "en que color",
    "tonalidad",
    "pintura",
    "comparar colores",
    "diferencia de color",
)


def user_asks_for_color(user_text: str) -> bool:
    """True si el mensaje pide el color del vehiculo o comparacion orientada a color."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return any(contains_signal_phrase(normalized, signal) for signal in _COLOR_QUESTION_SIGNALS)


_DIMENSION_QUESTION_SIGNALS: tuple[str, ...] = (
    "dimension",
    "dimensiones",
    "medidas",
    "medida",
    "cuanto mide",
    "cuanto mide de",
    "longitud",
    "ancho total",
    "de ancho",
    "altura",
    "altura total",
    "entre ejes",
    "distancia entre ejes",
    "que tan grande",
    "que tan largo",
    "tamano",
    "tamaño",
    "tamaño del",
    "tamano del",
)


def user_asks_for_dimensions(user_text: str) -> bool:
    """True si el mensaje pide dimensiones, medidas o tamaño del vehiculo."""

    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return any(contains_signal_phrase(normalized, signal) for signal in _DIMENSION_QUESTION_SIGNALS)


_TECHNICAL_SHEET_REQUEST_SIGNALS = (
    "dame la ficha",
    "ficha tecnica",
    "ficha del auto",
    "ficha del vehiculo",
    "ficha del modelo",
    "ficha del carro",
    "la ficha tecnica",
    "mandame la ficha",
    "enviale la ficha",
    "enviame la ficha",
    "comparte la ficha",
    "pdf de la ficha",
    "pasame el pdf",
    "pasame el archivo",
)


def user_asks_for_technical_sheet(user_text: str) -> bool:
    """True si el usuario pide explicitamente la ficha tecnica PDF del vehiculo.

    El PDF no se auto-adjunta al mostrar detalle ni en QA generico; solo con esta
    heuristica o junto a un pedido de imagenes (ver car_selection).
    """

    normalized = normalize_user_text(user_text)
    if not normalized:
        return False
    return any(signal in normalized for signal in _TECHNICAL_SHEET_REQUEST_SIGNALS)


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
