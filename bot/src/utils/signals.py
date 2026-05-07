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

NO_IMAGES_AVAILABLE_MESSAGE = (
    "Lamentablemente no tenemos imagenes de este vehiculo 🥲, "
    "pero puedes ponerte en contacto con un asesor para ver el carro en persona."
)

NO_MORE_IMAGES_MESSAGE = (
    "Ya no hay mas imagenes de este vehiculo. "
    "Si quieres, te ayudo con otro modelo o continuamos con la compra."
)

WC_IMAGE_MARKER_PREFIX = "<<WC_IMAGE_JSON>>"
