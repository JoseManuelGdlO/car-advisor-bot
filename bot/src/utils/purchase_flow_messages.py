"""Literales fijos del flujo de compra (preferencias + contacto).

Compartido por car_selection, faq y resume FAQ para evitar CTAs divergentes
y imports circulares con llm_responses.
"""

from __future__ import annotations

from typing import Any, Mapping, MutableMapping

CONTACT_PREFERENCE_MESSAGE = (
    "Un asesor profesional te va a contactar en menos de 10 minutos para darte, precios, "
    "colores disponibles y promo de Julio.\n"
    "¿Prefieres que te contacte por aquí por WhatsApp, por llamada o deseas agendar una cita?\n"
    "Por favor responde: whatsapp, llamada o cita"
)

CONTACT_PREFERENCE_MESSAGE_SHORT = (
    "Para que un asesor te contacte por favor contesta si prefieres hablar por "
    "whatsapp, llamada o agendar una cita"
)

PURCHASE_PREFERENCES_REASK_BOTH = "¿Automático o Estándar, y contado o financiado?"

FAQ_SOFT_CATALOG_CLOSE = "Si quieres, te muestro modelos disponibles."

LEAD_CONTACT_FOLLOWUP_WHATSAPP_CALL = "Un asesor te contactará pronto."


def is_contact_preference_message(text: str) -> bool:
    """True si el texto es el CTA largo o el corto de preferencia de contacto."""

    return text in (CONTACT_PREFERENCE_MESSAGE, CONTACT_PREFERENCE_MESSAGE_SHORT)


def resolve_contact_preference_message(
    state: Mapping[str, Any] | None = None,
    *,
    force_short: bool = False,
) -> str:
    """CTA largo la primera vez; corto tras financing/promos o si ya se pidio contacto."""

    if force_short:
        return CONTACT_PREFERENCE_MESSAGE_SHORT
    if state and (
        bool(state.get("contact_preference_prompt_sent"))
        or bool(state.get("awaiting_purchase_confirmation"))
    ):
        return CONTACT_PREFERENCE_MESSAGE_SHORT
    return CONTACT_PREFERENCE_MESSAGE


def mark_contact_preference_prompt_sent(state: MutableMapping[str, Any]) -> None:
    """Marca que ya se mostro al menos una vez el CTA de preferencia de contacto."""

    state["contact_preference_prompt_sent"] = True


def take_contact_preference_message(
    state: MutableMapping[str, Any],
    *,
    force_short: bool = False,
) -> str:
    """Resuelve el CTA y marca que ya se envio."""

    message = resolve_contact_preference_message(state, force_short=force_short)
    mark_contact_preference_prompt_sent(state)
    return message


def contact_preference_resume_message(state: Mapping[str, Any] | None = None) -> str:
    """CTA al reanudar tras FAQ en awaiting_purchase_confirmation (ya se pregunto antes)."""

    return resolve_contact_preference_message(state)


def purchase_preferences_resume_message(_state: Mapping[str, Any] | None = None) -> str:
    """CTA fijo al reanudar tras FAQ en awaiting_purchase_preferences."""

    _ = _state
    return PURCHASE_PREFERENCES_REASK_BOTH


def mid_purchase_close(state: Mapping[str, Any] | None) -> str:
    """Cierre literal mid-compra: prefs o contacto; vacio si no aplica."""

    if not state:
        return ""
    if bool(state.get("awaiting_purchase_preferences")):
        return PURCHASE_PREFERENCES_REASK_BOTH
    if bool(state.get("awaiting_purchase_confirmation")) and str(state.get("selected_car", "")).strip():
        return resolve_contact_preference_message(state)
    return ""


def commercial_info_follow_up(state: Mapping[str, Any] | None) -> str:
    """Follow-up tras info de financiamiento/promos segun paso actual."""

    if not state:
        return FAQ_SOFT_CATALOG_CLOSE
    if bool(state.get("awaiting_purchase_preferences")):
        return PURCHASE_PREFERENCES_REASK_BOTH
    if str(state.get("selected_car", "")).strip() or bool(state.get("awaiting_purchase_confirmation")):
        return resolve_contact_preference_message(state, force_short=True)
    return FAQ_SOFT_CATALOG_CLOSE
