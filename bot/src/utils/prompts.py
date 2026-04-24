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
    "Mensaje base: {base_text}"
)

CATALOG_REPLY_PROMPT = (
    "Redacta un mensaje claro para presentar opciones de catalogo.\n"
    "Mensaje base: {base_text}"
)

LEAD_CAPTURE_REPLY_PROMPT = (
    "Genera un mensaje corto para capturar o confirmar datos del cliente.\n"
    "Mensaje base: {base_text}"
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


def build_rewrite_prompt(base_text: str, bot_settings: dict[str, Any] | None) -> str:
    """Prompt final para reformular una respuesta manteniendo su significado."""

    system_prompt = build_system_prompt(bot_settings)
    return (
        f"{system_prompt}\n\n"
        "REESCRITURA:\n"
        "Reescribe el siguiente mensaje en espanol claro y breve. "
        "No cambies el significado ni agregues informacion nueva.\n\n"
        f"Mensaje base: {base_text}\n"
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


def build_available_models_intro_prompt(bot_settings: dict[str, Any] | None) -> str:
    """Prompt para la introduccion del listado de modelos disponibles."""

    system_prompt = build_system_prompt(bot_settings)
    return (
        f"{system_prompt}\n\n"
        "INTRO_MODELOS_DISPONIBLES:\n"
        "Redacta una sola frase breve y natural para presentar una lista de modelos disponibles. "
        "Debe invitar al usuario a elegir uno para conocer mas detalles. "
        "No inventes datos, no incluyas lista ni saltos de linea.\n\n"
        "Mensaje base: Aqui tienes los modelos disponibles. Te gustaria saber mas sobre alguno?"
    )


def build_vehicle_detail_intro_prompt(vehicle_name: str, bot_settings: dict[str, Any] | None) -> str:
    """Prompt para la introduccion del bloque de detalle de un vehiculo."""

    system_prompt = build_system_prompt(bot_settings)
    normalized_name = vehicle_name.strip() or "este vehiculo"
    return (
        f"{system_prompt}\n\n"
        "INTRO_DETALLE_VEHICULO:\n"
        "Redacta una sola frase breve y natural para introducir el detalle tecnico del vehiculo. "
        "No inventes datos, no agregues lista ni saltos de linea.\n\n"
        f"Mensaje base: Aqui tienes la informacion completa de {normalized_name}."
    )


def build_lead_capture_intro_prompt(
    vehicle_name: str,
    bot_settings: dict[str, Any] | None,
    resuming: bool = False,
) -> str:
    """Prompt para el mensaje inicial de captura de lead (asesor, datos de contacto)."""

    system_prompt = build_system_prompt(bot_settings)
    v = vehicle_name.strip() or "el vehiculo de interes"
    resume = (
        f"Contexto: el usuario volvio al flujo. Continuamos con {v}. "
        "No repitas un saludo largo; reconoce la continuacion y explica el siguiente paso."
        if resuming
        else (
            f"Contexto: el usuario esta interesado en {v} y quiere avanzar hacia un asesor. "
            "No saludes ni reinicies la conversacion; asume que el chat ya esta en curso."
        )
    )
    return (
        f"{system_prompt}\n\n"
        "MENSAJE_INTRO_CAPTURA_LEAD:\n"
        f"{resume} "
        "Explica con una o dos frases que necesitamos sus datos de contacto para que un asesor humano "
        f"pueda comunicarse y ayudarle con la compra de {v}. "
        "No pidas datos en un solo bloque con formato 'nombre: telefono: email:'. "
        "Al final, haz una unica pregunta clara pidiendo su NOMBRE COMPLETO (nombre y apellido), "
        "y usa la palabra 'nombre' en esa pregunta. "
        "Un solo parrafo corto o dos frases como maximo, sin listas."
    )


def build_vehicle_purchase_question_prompt(bot_settings: dict[str, Any] | None) -> str:
    """Prompt para la pregunta de cierre de compra."""

    system_prompt = build_system_prompt(bot_settings)
    return (
        f"{system_prompt}\n\n"
        "PREGUNTA_COMPRA_VEHICULO:\n"
        "Redacta una sola pregunta breve para confirmar si el usuario desea comprar el vehiculo o ver mas imagenes. "
        "Incluye 1 o 2 emojis maximo y no agregues saltos de linea.\n\n"
        "Mensaje base: Te interesa comprar este vehiculo o quieres ver mas imagenes del mismo?"
    )


def build_purchase_confirmation_classifier_prompt(
    previous_bot_message: str,
    user_message: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt clasificador para intencion de confirmacion de compra."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_CONFIRMACION_COMPRA:\n"
        "Clasifica la intencion del usuario con base en el mensaje previo del bot y la respuesta del usuario.\n"
        "Categorias validas:\n"
        "- SI: el usuario confirma compra o quiere avanzar con apartar/comprar.\n"
        "- NO: el usuario rechaza compra.\n"
        "- VER_MODELO: el usuario quiere seguir viendo opciones, otros modelos, o cambiar de vehiculo.\n"
        "- VER_MAS_IMAGENES: el usuario pide ver mas fotos/imagenes del vehiculo actual.\n"
        "Responde SOLO con una de estas etiquetas exactas: SI, NO, VER_MODELO, VER_MAS_IMAGENES.\n\n"
        f"Mensaje previo del bot: {previous}\n"
        f"Mensaje del usuario: {current}\n"
    )


def build_router_intent_classifier_prompt(
    user_message: str,
    previous_intent: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt clasificador de intencion para router principal."""

    system_prompt = build_system_prompt(bot_settings)
    message = user_message.strip() or "(mensaje vacio)"
    previous = previous_intent.strip() or "(sin intent previo)"
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_ROUTER_INTENT:\n"
        "Clasifica la intencion principal del usuario en una sola etiqueta.\n"
        "Etiquetas validas:\n"
        "- VEHICLE_CATALOG: pide ver, buscar o comparar carros/modelos/marcas, o menciona un modelo especifico.\n"
        "- FINANCING: pregunta por planes de financiamiento, credito, tasas, enganche, mensualidades o plazos.\n"
        "- FAQ: pregunta informacion general del negocio (ubicacion, horarios, garantias, contacto).\n"
        "- OTHER: saludo, agradecimiento o mensaje fuera del alcance.\n"
        "Responde SOLO con una etiqueta exacta: VEHICLE_CATALOG, FINANCING, FAQ, OTHER.\n\n"
        f"Intent previo: {previous}\n"
        f"Mensaje del usuario: {message}\n"
    )


def build_faq_interrupt_classifier_prompt(
    current_node: str,
    last_bot_message: str,
    user_message: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt para decidir si un mensaje es FAQ interruptiva o respuesta al flujo."""

    system_prompt = build_system_prompt(bot_settings)
    node = current_node.strip() or "(sin nodo actual)"
    bot_msg = last_bot_message.strip() or "(sin mensaje previo del bot)"
    user_msg = user_message.strip() or "(mensaje vacio)"
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_FAQ_INTERRUPT:\n"
        "Dado el nodo actual, el ultimo mensaje del bot y la respuesta del usuario, decide si el usuario:\n"
        "- FAQ: interrumpe para preguntar algo general del negocio.\n"
        "- FLOW_RESPONSE: esta respondiendo al flujo actual.\n"
        "Responde SOLO con una etiqueta exacta: FAQ o FLOW_RESPONSE.\n\n"
        f"Nodo actual: {node}\n"
        f"Ultimo mensaje del bot: {bot_msg}\n"
        f"Mensaje del usuario: {user_msg}\n"
    )


def build_faq_response_prompt(
    user_question: str,
    faq_context: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt para responder FAQ solo con contexto proveniente de BD."""

    system_prompt = build_system_prompt(bot_settings)
    question = user_question.strip() or "(mensaje vacio)"
    context = faq_context.strip() or "(sin contexto FAQ disponible)"
    return (
        f"{system_prompt}\n\n"
        "RESPUESTA_FAQ:\n"
        "Responde la pregunta del usuario usando EXCLUSIVAMENTE la BASE_FAQ provista.\n"
        "Si la BASE_FAQ no contiene informacion suficiente, dilo de forma clara y breve.\n"
        "No inventes datos. No saludes. No menciones que eres una IA.\n\n"
        f"PREGUNTA_USUARIO: {question}\n\n"
        f"BASE_FAQ:\n{context}\n"
    )
