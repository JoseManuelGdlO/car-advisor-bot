"""Literales fijos del flujo de compra (preferencias + contacto).

Compartido por car_selection, faq y resume FAQ para evitar CTAs divergentes
y imports circulares con llm_responses.
"""

from __future__ import annotations

from typing import Any, Mapping

CONTACT_PREFERENCE_MESSAGE = (
    "Un asesor profesional te va a contactar en menos de 10 minutos para darte, precios, "
    "colores disponibles y promo de Julio.\n"
    "¿Prefieres que te contacte por aquí por WhatsApp, por llamada o deseas agendar una cita?\n"
    "Por favor responde: whatsapp, llamada o cita"
)

PURCHASE_PREFERENCES_REASK_BOTH = "¿Automático o Estándar, y contado o financiado?"

FAQ_SOFT_CATALOG_CLOSE = "Si quieres, te muestro modelos disponibles."

LEAD_CONTACT_FOLLOWUP_WHATSAPP_CALL = "Un asesor te contactará pronto."


def contact_preference_resume_message() -> str:
    """CTA fijo al reanudar tras FAQ en awaiting_purchase_confirmation."""

    return CONTACT_PREFERENCE_MESSAGE


def purchase_preferences_resume_message(_state: Mapping[str, Any] | None = None) -> str:
    """CTA fijo al reanudar tras FAQ en awaiting_purchase_preferences."""

    _ = _state
    return PURCHASE_PREFERENCES_REASK_BOTH
