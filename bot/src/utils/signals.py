"""Constantes de señales compartidas por nodos conversacionales."""

from __future__ import annotations

GENERAL_SIGNALS = {
    "que carros tienes",
    "que autos tienes",
    "carros disponibles",
    "autos disponibles",
    "que marcas",
    "marcas disponibles",
    "catalogo",
    "catálogo",
    "mostrar vehiculos",
    "mostrar vehiculos disponibles",
    "mostrar carros",
    "como cuales",
    "de cuales",
    "que cuales",
    "y cuales",
    "cuales manejas",
    "cuales manejan",
    "cuales tienes",
    "cuales tienen",
    "que marcas manejas",
    "que marcas manejan",
    "que marcas tienes",
    "que marcas tienen",
}

FEATURE_SIGNALS = {
    "color",
    "marca",
    "modelo",
    "ano",
    "año",
    "verde",
    "rojo",
    "azul",
    "negro",
    "blanco",
    "gris",
}

FIRST_IMAGES_SIGNALS = {
    "ver fotos",
    "ver foto",
    "ver imagenes",
    "ver imagen",
    "ver las fotos",
    "ver las imagenes",
    "muestrame fotos",
    "muéstrame fotos",
    "muestrame imagenes",
    "muéstrame imagenes",
    "quiero ver fotos",
    "quiero ver imagenes",
    "tienen fotos",
    "hay fotos",
    "mandame fotos",
    "mándame fotos",
    "envia fotos",
    "envía fotos",
    "pasame fotos",
    "pásame fotos",
}

MORE_IMAGES_SIGNALS = {
    "ver mas imagenes",
    "ver más imagenes",
    "ver mas fotos",
    "ver más fotos",
    "mas imagenes",
    "más imagenes",
    "mas fotos",
    "más fotos",
    "siguientes imagenes",
    "siguientes fotos",
}

FINANCING_SIGNALS = {
    "financiamiento",
    "financiar",
    "financiado",
    "credito",
    "credito automotriz",
    "mensualidad",
    "mensualidades",
    "enganche",
    "tasa",
    "interes",
    "plazo",
    "plan financiero",
    "planes financieros",
    "plan de financiamiento",
    "planes de financiamiento",
    "pagos",
    "plan de pagos",
    "planes de pagos",
}

PROMOTIONS_SIGNALS = {
    "promocion",
    "promociones",
    "oferta",
    "ofertas",
    "descuento",
    "descuentos",
    "bono",
    "bonos",
    "promos",
    "promo"
}

TEST_DRIVE_VISIT_SIGNALS = {
    "prueba de manejo",
    "prueba manejo",
    "agendar prueba",
    "agendar una prueba",
    "quiero probar",
    "quiero una prueba",
    "probar el auto",
    "probar el carro",
    "probar el vehiculo",
    "test drive",
    "ver en persona",
    "verlo en persona",
    "verla en persona",
    "ver el vehiculo en persona",
    "ver el auto en persona",
    "ver el carro en persona",
    "visita en persona",
    "visitar el vehiculo",
    "visitar el auto",
    "coordinar visita",
    "agendar visita",
    "agendar cita",
    "agendar una cita",
    "quiero agendar cita",
    "quiero agendar una cita",
}

CATALOG_SIGNALS = {
    "modelo",
    "modelos",
    "carro",
    "carros",
    "auto",
    "autos",
    "vehiculo",
    "vehiculos",
    "marca",
    "marcas",
    "catalogo",
    "disponible",
    "disponibles",
}

EXPLICIT_CATALOG_BROWSE_TOKENS = {
    "catalogo",
    "modelos",
    "marcas",
    "disponibles",
    "inventario",
    "vehiculos",
    "autos",
    "listado",
}

# Subcadenas en texto ya normalizado (sin acentos) para heuristica del router.
ROUTER_VEHICLE_SUBSTR_SIGNALS: frozenset[str] = frozenset(
    CATALOG_SIGNALS
    | {
        "marcas",
        "color",
        "ano",
        "año",
        "precio",
        "camioneta",
        "pickup",
    }
)

ROUTER_SIMPLE_GREETINGS_NORMALIZED: frozenset[str] = frozenset(
    {
        "hola",
        "buenas",
        "buenos dias",
        "buen dia",
        "buena tarde",
        "buenas tardes",
        "buena noche",
        "buenas noches",
        "hey",
        "holi",
    }
)


def is_simple_greeting(text: str) -> bool:
    """True cuando el mensaje es un saludo corto reconocido por el router."""

    from src.tools.vehicles import normalize_user_text

    normalized = normalize_user_text(text)
    if not normalized:
        return False
    return normalized in ROUTER_SIMPLE_GREETINGS_NORMALIZED


_GREETING_STRIP_TOKENS: tuple[str, ...] = (
    "buenos dias",
    "buenas tardes",
    "buenas noches",
    "buena tarde",
    "buena noche",
    "buen dia",
    "que tal",
    "buenas",
    "hola",
    "hey",
    "holi",
)


def _strip_greeting_tokens(normalized: str) -> str:
    """Quita tokens de saludo (frases largas primero) y devuelve el resto normalizado."""

    remainder = normalized
    for token in _GREETING_STRIP_TOKENS:
        remainder = remainder.replace(token, " ")
    return " ".join(remainder.split()).strip()


def is_greeting_only_message(text: str) -> bool:
    """True cuando el mensaje es solo saludo, incluyendo compuestos como 'hola buenas tardes'."""

    from src.tools.vehicles import normalize_user_text

    normalized = normalize_user_text(text)
    if not normalized:
        return False
    if normalized in ROUTER_SIMPLE_GREETINGS_NORMALIZED:
        return True
    stripped = _strip_greeting_tokens(normalized)
    if stripped != normalized:
        return len(stripped) < 4
    return False

FINANCING_PLANES_COMBO_SUFFIXES: frozenset[str] = frozenset(
    ("financ", "credito", "mensual", "enganche", "tasa", "interes")
)

BUSINESS_LOCATION_FAQ_SUBSTR: frozenset[str] = frozenset(
    (
        "ubicado",
        "ubicados",
        "ubicadas",
        "donde estan",
        "donde se encuentran",
        "donde quedan",
        "donde los encuentro",
        "donde los ubico",
        "donde hacen",
        "direccion",
        "direcciones",
        "sucursal",
        "sucursales",
        "mantenimiento",
        "taller",
        "refacciones",
        "area de servicio",
        "servicio de",
        "servicios de",
    )
)

BUSINESS_HOURS_FAQ_SUBSTR: frozenset[str] = frozenset(
    (
        "horario",
        "horarios",
        "a que hora",
        "que hora",
        "hora abren",
        "hora cierran",
        "cuando abren",
        "cuando cierran",
        "dias de atencion",
        "horas de atencion",
        "hora de atencion",
    )
)

BUSINESS_GENERAL_FAQ_SUBSTR: frozenset[str] = frozenset(
    (
        "garantia",
        "garantias",
        "papeles",
        "documentos para comprar",
        "metodos de pago",
        "formas de pago",
        "buro de credito",
        "buro crediticio",
        "adeudos",
        "multas del vehiculo",
        "politica de devolucion",
        "telefono de la agencia",
        "telefono de oficina",
    )
)

BUSINESS_FAQ_QUESTION_SUBSTR: frozenset[str] = frozenset(
    BUSINESS_LOCATION_FAQ_SUBSTR | BUSINESS_HOURS_FAQ_SUBSTR | BUSINESS_GENERAL_FAQ_SUBSTR
)


def is_business_faq_question(text: str) -> bool:
    """True si el mensaje parece FAQ de negocio (horario, ubicacion, garantia, etc.)."""

    from src.tools.vehicles import normalize_user_text

    normalized = normalize_user_text(text)
    if not normalized:
        return False
    return any(term in normalized for term in BUSINESS_FAQ_QUESTION_SUBSTR)

# Subcadenas en texto ya normalizado (normalize_user_text: sin acentos, minusculas).
HUMAN_ADVISOR_HEURISTIC_SUBSTR: frozenset[str] = frozenset(
    (
        "asesor humano",
        "hablar con un asesor",
        "hablar con asesor",
        "con un asesor",
        "con asesor",
        "persona real",
        "agente humano",
        "atencion humana",
        "comunicarme con alguien",
        "hablar con alguien",
        "ponme con un asesor",
        "quiero un asesor",
        "necesito un asesor",
        "pasame con un asesor",
        "pasame con alguien",
        "operador humano",
        "linea humana",
    )
)

CATALOG_BROWSE_VERB_HINTS = {"muestra", "ver", "otros"}
CATALOG_BROWSE_TARGET_HINTS = {"modelo", "disponible", "opciones", "catalogo", "carro", "auto", "vehiculo", "otros"}

AFFIRMATIVE_SIGNALS = {"si", "sí", "claro", "acepto", "me interesa", "quiero", "va", "dale"}
NEGATIVE_SIGNALS = {"no", "nel", "paso", "no gracias", "ya no", "mejor no"}

VEHICLE_INFO_REQUEST_SIGNALS = {"vehiculo", "carro", "auto", "modelo", "detalles", "detalle", "ver", "mostrar", "informacion"}

PLAN_VEHICLE_INFO_SIGNALS = {
    "como es",
    "detalles",
    "detalle",
    "info",
    "informacion",
    "vehiculo",
    "carro",
    "auto",
    "modelo",
    "imagen",
    "imagenes",
    "foto",
    "fotos",
}

EXPLICIT_PROMOTION_APPLY_SIGNALS = {
    "aplico",
    "aplicar",
    "quiero esa promocion",
    "quiero aplicar",
    "si quiero la promocion",
    "tomar promocion",
}

PROMOTION_TOKEN_STOPWORDS = frozenset(
    {
        "el","la","los","las",
        "un","una","unos","unas",
        "de","del","al","y","o",
        "en","con","por","para",
        "que","me","te","se","lo",
        "le","les","a","es","son","mi",
        "tu","su","mis","tus","sus",
        "esta","este","estos","estas",
        "eso","esa","esos","esas",
        "si","no","oye","bueno","pues",
    }
)

NO_IMAGES_AVAILABLE_MESSAGE = (
    "Lamentablemente no tenemos imagenes de este vehiculo 🥲, "
    "pero podemos coordinar una visita para que lo veas en persona."
)

NO_MORE_IMAGES_MESSAGE = (
    "Ya no hay mas imagenes de este vehiculo. "
    "Si te interesa, podemos avanzar con una prueba de manejo o para que veas el vehiculo en persona; "
    "tambien puedo mostrarte otro modelo."
)

WC_IMAGE_MARKER_PREFIX = "<<WC_IMAGE_JSON>>"
WC_DOCUMENT_MARKER_PREFIX = "<<WC_DOCUMENT_JSON>>"
