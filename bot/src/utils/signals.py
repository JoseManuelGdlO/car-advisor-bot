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
        "buenas tardes",
        "buenas noches",
        "hey",
        "holi",
    }
)

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
        "direccion",
        "direcciones",
        "sucursal",
        "sucursales",
    )
)

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
