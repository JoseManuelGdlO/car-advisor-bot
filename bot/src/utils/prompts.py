"""Plantillas y builders de prompts para el bot de carros."""

from __future__ import annotations

from typing import Any

DEFAULT_RESPONSE_FALLBACK = (
    "Eres un asesor virtual de carros. Responde en espanol claro, breve y util."
)

_SYSTEM_RULES_BLOCK = (
    "REGLAS FIJAS:\n"
    "- Mantente enfocado en ayudar al usuario con marcas, modelos y proceso de contacto.\n"
    "- No inventes datos que no existan en el contexto.\n"
    "- Si faltan datos, pide lo minimo necesario para avanzar.\n"
    "- Manten un tono humano y claro."
)

ROUTER_OTHER_REPLY_PROMPT = (
    "Genera una respuesta breve para orientar al usuario.\n"
    "Mensaje base: {base_text}\n"
    "Opciones sugeridas: {options}"
)

CATALOG_REPLY_PROMPT = (
    "Redacta un mensaje claro para presentar opciones de catalogo.\n"
    "Mensaje base: {base_text}\n"
    "Opciones: {options}"
)

LEAD_CAPTURE_REPLY_PROMPT = (
    "Genera un mensaje corto para capturar o confirmar datos del cliente.\n"
    "Mensaje base: {base_text}\n"
    "Opciones: {options}"
)


def _tone_instruction(tone: str) -> str:
    value = (tone or "").strip().lower()
    mapping = {
        "formal": "Usa un tono formal, cordial y profesional.",
        "cercano": "Usa un tono cercano, amable y natural.",
        "vendedor": "Usa un tono vendedor consultivo sin ser agresivo.",
        "tecnico": "Usa un tono tecnico simple, facil de entender.",
    }
    return mapping.get(value, mapping["cercano"])


def _emoji_instruction(emoji_style: str) -> str:
    value = (emoji_style or "").strip().lower()
    mapping = {
        "nunca": "No uses emojis.",
        "pocos": "Usa pocos emojis y solo si aportan claridad.",
        "frecuentes": "Puedes usar emojis con frecuencia moderada y buen criterio.",
    }
    return mapping.get(value, mapping["pocos"])


def _sales_instruction(sales_proactivity: str) -> str:
    value = (sales_proactivity or "").strip().lower()
    mapping = {
        "bajo": "No presiones venta; responde solo lo solicitado.",
        "medio": "Sugiere el siguiente paso comercial cuando sea natural.",
        "alto": "Propone activamente avanzar a ver marcas, modelos y contacto.",
    }
    return mapping.get(value, mapping["medio"])


def build_settings_block(settings: dict[str, Any] | None) -> str:
    """Convierte settings generales en instrucciones de estilo consistentes."""

    cfg = settings or {}
    custom_instructions = str(cfg.get("customInstructions", "")).strip()
    parts = [
        "CONFIGURACION_GLOBAL_DEL_BOT:",
        f"- {_tone_instruction(str(cfg.get('tone', 'cercano')))}",
        f"- {_emoji_instruction(str(cfg.get('emojiStyle', 'pocos')))}",
        f"- {_sales_instruction(str(cfg.get('salesProactivity', 'medio')))}",
    ]
    if custom_instructions:
        parts.append(f"- Instrucciones personalizadas del negocio: {custom_instructions}")
    return "\n".join(parts)


def build_system_prompt(bot_settings: dict[str, Any] | None, fallback_response: str | None = None) -> str:
    """Construye prompt de sistema para respuestas al usuario."""

    base_prompt = (fallback_response or "").strip() or DEFAULT_RESPONSE_FALLBACK
    return "\n\n".join([base_prompt, _SYSTEM_RULES_BLOCK, build_settings_block(bot_settings)])


def build_rewrite_prompt(base_text: str, options: list[str], bot_settings: dict[str, Any] | None) -> str:
    """Prompt final para reformular una respuesta manteniendo su significado."""

    system_prompt = build_system_prompt(bot_settings)
    return (
        f"{system_prompt}\n\n"
        "REESCRITURA:\n"
        "Reescribe el siguiente mensaje en espanol claro y breve. "
        "No cambies el significado ni agregues informacion nueva. "
        "Si hay opciones, mantenlas al final como lista.\n\n"
        f"Mensaje base: {base_text}\n"
        f"Opciones: {options}"
    )


def build_other_response_prompt(user_message: str, bot_settings: dict[str, Any] | None) -> str:
    """Prompt para generar respuesta libre en intent `other`."""

    system_prompt = build_system_prompt(bot_settings)
    return (
        f"{system_prompt}\n\n"
        "RESPUESTA_CONVERSACIONAL:\n"
        "Eres CarAdvisor. Responde al usuario con un saludo breve y humano. "
        "Invita a elegir entre ver marcas/modelos o preguntar por un carro especifico. "
        "Cierra ofreciendo resolver dudas.\n\n"
        f"Mensaje del usuario: {user_message}"
    )
