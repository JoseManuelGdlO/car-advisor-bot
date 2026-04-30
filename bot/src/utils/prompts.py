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
    """Helper de apoyo para tone instruction."""
    value = (tone or "").strip().lower()
    mapping = {
        "formal": "Usa un tono formal, cordial y profesional.",
        "cercano": "Usa un tono cercano, amable y natural.",
        "vendedor": "Usa un tono vendedor consultivo sin ser agresivo.",
        "tecnico": "Usa un tono tecnico simple, facil de entender.",
    }
    return mapping.get(value, mapping["cercano"])


def _emoji_instruction(emoji_style: str) -> str:
    """Helper de apoyo para emoji instruction."""
    value = (emoji_style or "").strip().lower()
    mapping = {
        "nunca": "No uses emojis.",
        "pocos": "Usa pocos emojis y solo si aportan claridad.",
        "frecuentes": "Puedes usar emojis con frecuencia moderada y buen criterio.",
    }
    return mapping.get(value, mapping["pocos"])


def _sales_instruction(sales_proactivity: str) -> str:
    """Helper de apoyo para sales instruction."""
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
        "Eres CarAdvisor. Responde de forma natural y contextual al ultimo mensaje del usuario.\n"
        "Reglas:\n"
        "- Solo saluda si el usuario esta saludando explicitamente o si el mensaje parece de inicio de conversacion.\n"
        "- Si el usuario agradece (por ejemplo: gracias, muchas gracias), responde agradeciendo de vuelta "
        "(por ejemplo: con gusto/de nada) y NO vuelvas a saludar.\n"
        "- Si no hay saludo ni agradecimiento, responde sin saludo de apertura.\n"
        "- Puedes invitar a preguntar por marcas/modelos o dudas de un vehiculo, sin sonar repetitivo.\n"
        "- Cierra ofreciendo resolver cualquier duda que tenga el usuario.\n\n"
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


def build_vehicle_candidates_selection_prompt(
    options_text: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt para redactar mensaje de seleccion cuando hay multiples candidatos."""

    system_prompt = build_system_prompt(bot_settings)
    normalized_options = options_text.strip()
    return (
        f"{system_prompt}\n\n"
        "SELECCION_MULTIPLES_VEHICULOS:\n"
        "Redacta una introduccion breve para pedir al usuario que elija un vehiculo de una lista.\n"
        "Debes mantener EXACTAMENTE la lista de opciones tal como viene en LISTA_OPCIONES "
        "(mismos numeros, nombres y saltos de linea), sin reordenar ni modificar contenido.\n"
        "Despues de la lista agrega una instruccion breve para responder con nombre o numero.\n"
        "Devuelve un solo bloque de texto, solo saluda si el usuario te ha saludado.\n" 
        "Debes mencionar que estos son los vehiculos disponibles o los que encontraste.\n\n"
        f"LISTA_OPCIONES:\n{normalized_options}\n"
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
        "Explica con una o dos frases que necesitamos sus datos de contacto para que un asesor (no menciones que el aseasor es humano) "
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


def build_financing_plan_selection_classifier_prompt(
    previous_bot_message: str,
    user_message: str,
    plan_count: int,
    single_plan_name: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt clasificador para seleccion de plan de financiamiento."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    normalized_count = max(plan_count, 0)
    normalized_name = single_plan_name.strip() or "(sin nombre de plan)"
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_SELECCION_PLAN_FINANCIAMIENTO:\n"
        "Con base en el mensaje previo del bot y la respuesta del usuario, clasifica la intencion en una etiqueta.\n"
        "Etiquetas validas:\n"
        "- SELECT_SINGLE_PLAN: cuando hay un solo plan disponible y el usuario confirma avanzar (ej. si, me interesa, adelante).\n"
        "- ASK_EXPLICIT_PLAN: cuando falta confirmar plan de forma clara o hay ambiguedad.\n"
        "- REJECT: cuando el usuario rechaza continuar con ese plan o niega interes.\n"
        "Reglas:\n"
        "- Si plan_count != 1, nunca devuelvas SELECT_SINGLE_PLAN.\n"
        "- Responde SOLO con una etiqueta exacta: SELECT_SINGLE_PLAN, ASK_EXPLICIT_PLAN o REJECT.\n\n"
        f"plan_count: {normalized_count}\n"
        f"single_plan_name: {normalized_name}\n"
        f"Mensaje previo del bot: {previous}\n"
        f"Mensaje del usuario: {current}\n"
    )


def build_promotion_selection_classifier_prompt(
    previous_bot_message: str,
    user_message: str,
    promotion_count: int,
    single_promotion_title: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt clasificador para seleccion explicita de promocion."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    normalized_count = max(promotion_count, 0)
    normalized_title = single_promotion_title.strip() or "(sin titulo)"
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_SELECCION_PROMOCION:\n"
        "Con base en el mensaje previo del bot y la respuesta del usuario, clasifica la intencion en una etiqueta.\n"
        "Etiquetas validas:\n"
        "- APPLY_SINGLE_PROMOTION: cuando hay una promocion y el usuario confirma aplicarla de forma explicita.\n"
        "- ASK_EXPLICIT_PROMOTION: cuando falta confirmar aplicacion explicita o hay ambiguedad.\n"
        "- REJECT: cuando el usuario rechaza aplicar la promocion.\n"
        "Reglas:\n"
        "- Si promotion_count != 1, nunca devuelvas APPLY_SINGLE_PROMOTION.\n"
        "- No consideres preguntas de detalle del vehiculo como aplicacion explicita.\n"
        "- Responde SOLO con una etiqueta exacta: APPLY_SINGLE_PROMOTION, ASK_EXPLICIT_PROMOTION o REJECT.\n\n"
        f"promotion_count: {normalized_count}\n"
        f"single_promotion_title: {normalized_title}\n"
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
        "- PROMOTIONS: pregunta por promociones, ofertas, descuentos o bonos para un vehiculo o en general.\n"
        "- FAQ: pregunta informacion general del negocio (ubicacion, horarios, garantias, contacto).\n"
        "- OTHER: saludo, agradecimiento o mensaje fuera del alcance.\n"
        "Responde SOLO con una etiqueta exacta: VEHICLE_CATALOG, FINANCING, PROMOTIONS, FAQ, OTHER.\n\n"
        f"Intent previo: {previous}\n"
        f"Mensaje del usuario: {message}\n"
    )


def build_vehicle_step_flags_prompt(
    previous_bot_message: str,
    user_message: str,
    selected_vehicle_name: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt clasificador por flags para decision en car_selection (paso confirmacion)."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    vehicle = selected_vehicle_name.strip() or "(sin vehiculo seleccionado)"
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_FLAGS_PASO_VEHICULO:\n"
        "Analiza el mensaje del usuario y responde SOLO con JSON de una linea con estas claves booleanas exactas:\n"
        '{ "ask_promotions": <bool>, "ask_financing": <bool>, "ask_more_images": <bool>, "wants_other_vehicles": <bool>, "confirm_purchase": <bool>, "reject_purchase": <bool> }\n'
        "Reglas:\n"
        "- ask_promotions=true cuando pide promociones/ofertas/descuentos para el vehiculo actual o en general.\n"
        "- ask_financing=true cuando pide credito/financiamiento/tasa/plazo/mensualidades.\n"
        "- ask_more_images=true cuando pide mas fotos/imagenes del vehiculo actual.\n"
        "- wants_other_vehicles=true cuando quiere ver otro modelo/u otro carro/catalogo.\n"
        "- confirm_purchase=true cuando confirma avanzar o comprar el vehiculo actual.\n"
        "- reject_purchase=true cuando rechaza comprar el vehiculo actual.\n"
        "- Si faltan señales claras, usa false en esas claves.\n\n"
        f"Vehiculo actual: {vehicle}\n"
        f"Mensaje previo del bot: {previous}\n"
        f"Mensaje del usuario: {current}\n"
    )


def build_promotions_step_flags_prompt(
    user_message: str,
    current_promotion_title: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt clasificador por flags para navegacion dentro del nodo promotions."""

    system_prompt = build_system_prompt(bot_settings)
    current = user_message.strip() or "(mensaje vacio)"
    promotion = current_promotion_title.strip() or "(sin promocion seleccionada)"
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_FLAGS_PROMOTIONS:\n"
        "Responde SOLO con JSON de una linea con estas claves booleanas exactas:\n"
        '{ "ask_financing": <bool>, "ask_other_vehicles": <bool>, "ask_promotions": <bool>, "confirm_yes": <bool>, "confirm_no": <bool> }\n'
        "Reglas:\n"
        "- ask_financing=true cuando pide planes/tasas/credito.\n"
        "- ask_other_vehicles=true cuando pide ver otros carros/modelos/catalogo.\n"
        "- ask_promotions=true cuando sigue en tema promociones (listar/ver/consultar).\n"
        "- confirm_yes=true cuando confirma afirmativamente una pregunta de decision.\n"
        "- confirm_no=true cuando responde negativamente una pregunta de decision.\n"
        "- Si no aplica, deja false.\n\n"
        f"Promocion actual: {promotion}\n"
        f"Mensaje del usuario: {current}\n"
    )


def build_lead_capture_navigation_classifier_prompt(
    previous_bot_message: str,
    user_message: str,
    selected_vehicle_name: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt clasificador para desvio de flujo durante captura de lead."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    vehicle = selected_vehicle_name.strip() or "(sin vehiculo seleccionado)"
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_NAVEGACION_LEAD_CAPTURE:\n"
        "Estas dentro de captura de datos (nombre/telefono/correo) para cerrar la compra.\n"
        "Clasifica SOLO si el usuario quiere cambiar de tema en este turno.\n"
        "Responde SOLO con una etiqueta exacta:\n"
        "- STAY: continuar captura de lead (incluye confirmaciones de interes, respuestas ambiguas, datos de contacto).\n"
        "- PROMOTIONS: pide promociones/ofertas/descuentos/bonos.\n"
        "- FINANCING: pide planes/tasas/plazos/credito/enganche.\n"
        "- CAR_SELECTION: pide ver otros modelos/vehiculos/catalogo distintos al actual.\n"
        "Reglas criticas:\n"
        "- Si el usuario expresa interes en el vehiculo actual (ej. 'me interesa', 'si quiero este') => STAY.\n"
        "- Si responde con posibles datos de contacto (nombre, telefono, correo) => STAY.\n"
        "- Solo usa CAR_SELECTION cuando sea explicito que quiere ver otras opciones.\n\n"
        f"Vehiculo actual: {vehicle}\n"
        f"Mensaje previo del bot: {previous}\n"
        f"Mensaje del usuario: {current}\n"
    )


def build_faq_interrupt_flags_prompt(
    current_node: str,
    last_bot_message: str,
    user_message: str,
    awaiting_purchase_confirmation: bool,
    pending_vehicle_count: int,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Clasificador estructurado: flags para FAQ de negocio frente a continuidad de flujo."""

    system_prompt = build_system_prompt(bot_settings)
    node = current_node.strip() or "(sin nodo actual)"
    bot_msg = last_bot_message.strip() or "(sin mensaje previo del bot)"
    user_msg = user_message.strip() or "(mensaje vacio)"
    espera_conf = "si" if awaiting_purchase_confirmation else "no"
    cands = str(int(max(0, pending_vehicle_count)))
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_FAQ_CON_FLAGS:\n"
        "Evalua el ultimo mensaje del usuario en el contexto del nodo y del asistente.\n"
        "Responde SOLO con un objeto JSON, sin codigo, sin comentarios, en una sola linea. Formato exacto de claves:\n"
        "{\n"
        '  "interrumpir_por_faq": <bool>,\n'
        '  "tema_vehiculo_inventario": <bool>,\n'
        '  "tema_financiamiento_credi": <bool>,\n'
        '  "es_respuesta_o_seguimiento_al_ultimo_bot": <bool>\n'
        "}\n\n"
        "Definicion de interrumpir_por_faq (true = debe atenderse con FAQ de negocio, no con catalogo/planes):\n"
        "- true: pregunta por el negocio, agencia o lote: ubicacion, horarios, garantia o politica del lote, "
        "contacto de oficina, datos generales de la concesionaria, que metodos de pago aceptan en caja, etc.\n"
        "- false: todo lo demas, incluido: preguntas sobre un coche, modelo, anio, estado, 'como es' un auto, "
        "comparaciones de unidades, mas fotos, si/no, respuestas cortas al turno, credito/enganche/plazos concretos al elegir coche, "
        "cualquier cosa de inventario, catalogo o cierre de paso (confirmacion de compra, datos, etc.)\n"
        f"Contexto: esperando_confirmacion_compra={espera_conf} | candidatos_vehiculo_listos_para_elegir={cands}.\n"
        "tema_vehiculo_inventario: el mensaje trata de autos, unidades, modelos, anios, fotos, detalles, comparar.\n"
        "tema_financiamiento_credi: enganche, plazo, tasa, credito, mensualidad en contexto de plan o coche (no caja del negocio en abstracto si el usuario pide oficina).\n"
        "es_respuesta_o_seguimiento_al_ultimo_bot: el mensaje responde o reacciona al turno inmediato del bot (si, no, ok, otra, una seleccion, un dato pedido).\n"
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
