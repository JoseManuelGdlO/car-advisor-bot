"""Plantillas y builders de prompts para el bot de carros."""

from __future__ import annotations

import json
from typing import Any

DEFAULT_RESPONSE_FALLBACK = (
    "Eres el asistente de una agencia de carros. Responde en espanol claro, breve y util."
)

_SYSTEM_RULES_BLOCK = (
    "REGLAS FIJAS:\n"
    "- Mantente enfocado en ayudar al usuario con marcas, modelos y proceso de contacto.\n"
    "- No inventes datos que no existan en el contexto.\n"
    "- Si faltan datos, pide lo minimo necesario para avanzar.\n"
    "- Manten un tono humano y claro.\n"
    "- No uses las palabras 'asesor' ni 'asesora' en mensajes al usuario."
    "- No repitas el mismo mensaje en diferentes formatos."
    "- Trata de mantener la conversacion fluida y natural."
    "- Usa lenguaje natural y no robotizado."
    "- Prioriza respuestas cortas y faciles de leer en el chat; evita textos largos salvo que el usuario pida mas detalle."
    "- Cada vez que menciones un precio de vehiculo, escribelo como 'a partir de' seguido del monto exacto "
    "que aparezca en DATOS_VERIFICADOS (ej. 'a partir de $350,000.00'); no presentes el monto como precio fijo."
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
        "frecuentes": "Puedes usar emojis con frecuencia y buen criterio.",
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


def _optional_text(value: Any) -> str | None:
    """Normaliza texto opcional de settings; vacio o None -> None."""

    if value is None:
        return None
    text = str(value).strip()
    return text or None


def build_settings_block(settings: dict[str, Any] | None) -> str:
    """Convierte settings generales en instrucciones de estilo consistentes."""

    cfg = settings or {}
    custom_instructions = str(cfg.get("customInstructions", "")).strip()
    parts = [
        "CONFIGURACION_GLOBAL_DEL_BOT:",
        f"- {_tone_instruction(str(cfg.get('tone', 'cercano')))}",
        f"- {_emoji_instruction(str(cfg.get('emojiStyle', 'frecuentes')))}",
        f"- {_sales_instruction(str(cfg.get('salesProactivity', 'bajo')))}",
        f"- Solo saluda si el usuario esta saludando explicitamente o si el mensaje parece de inicio de conversacion.",
        f"- No sugieras agendar citas; indica que el equipo dara seguimiento cuando corresponda.",
        f"- No puedes agendar citas, solo puedes responder preguntas y ofrecer informacion.",
        f"- Tus respuestan deben ser naturales y humanas, no robotizadas.",
        f"- Tus respuestas deben ser breves y directas, no largas y detalladas."
    ]
    bot_name = _optional_text(cfg.get("botName"))
    if bot_name:
        parts.append(f"- Te presentas al usuario como: {bot_name}")
    if custom_instructions:
        parts.append(f"- Instrucciones personalizadas del negocio: {custom_instructions}")
    return "\n".join(parts)


def build_bot_message_templates_block(settings: dict[str, Any] | None) -> str:
    """Bloque verificable con mensajes predefinidos del tenant (solo si estan configurados)."""

    cfg = settings or {}
    lines: list[str] = []
    welcome = _optional_text(cfg.get("welcomeMessage"))
    faq_fallback = _optional_text(cfg.get("faqFallbackMessage"))
    if welcome:
        lines.append(f"- mensaje_bienvenida_literal: {welcome}")
    if faq_fallback:
        lines.append(f"- mensaje_fallback_faq_literal: {faq_fallback}")
    if not lines:
        return ""
    return "MENSAJES_PREDEFINIDOS_VERIFICADOS:\n" + "\n".join(lines)


def append_bot_message_templates_to_verified_block(
    facts: str,
    settings: dict[str, Any] | None,
) -> str:
    """Anexa MENSAJES_PREDEFINIDOS_VERIFICADOS al bloque DATOS_VERIFICADOS si aplica."""

    block = build_bot_message_templates_block(settings)
    if not block:
        return str(facts or "").strip()
    base = str(facts or "").strip()
    if not base:
        return block
    return f"{base}\n\n{block}"


# Excluye razon social y NIT: datos fiscales internos, no para conversacion con clientes.
_BUSINESS_PROFILE_FIELD_LABELS: tuple[tuple[str, str], ...] = (
    ("tradeName", "nombre_comercial"),
    ("businessPhone", "telefono_negocio"),
    ("businessEmail", "email_negocio"),
    ("website", "sitio_web"),
    ("addressLine", "direccion"),
    ("city", "ciudad"),
    ("state", "estado_departamento"),
    ("country", "pais"),
    ("description", "descripcion_negocio"),
    ("logoUrl", "url_logo"),
)


def build_business_profile_block(business_profile: dict[str, Any] | None) -> str:
    """Formatea el perfil comercial del tenant como bloque verificable para DATOS_VERIFICADOS."""

    profile = business_profile or {}
    lines: list[str] = []
    for key, label in _BUSINESS_PROFILE_FIELD_LABELS:
        value = str(profile.get(key, "") or "").strip()
        if value:
            lines.append(f"- {label}: {value}")
    if not lines:
        return ""
    return "PERFIL_NEGOCIO_VERIFICADO:\n" + "\n".join(lines)


def append_business_profile_to_verified_block(
    facts: str,
    business_profile: dict[str, Any] | None,
) -> str:
    """Anexa PERFIL_NEGOCIO_VERIFICADO al bloque DATOS_VERIFICADOS sin alterar el contenido previo."""

    block = build_business_profile_block(business_profile)
    if not block:
        return str(facts or "").strip()
    base = str(facts or "").strip()
    if not base:
        return block
    return f"{base}\n\n{block}"


def build_system_prompt(bot_settings: dict[str, Any] | None, fallback_response: str | None = None) -> str:
    """Construye prompt de sistema para respuestas al usuario."""

    base_prompt = (fallback_response or "").strip() or DEFAULT_RESPONSE_FALLBACK
    return "\n\n".join([base_prompt, _SYSTEM_RULES_BLOCK, build_settings_block(bot_settings)])


def build_other_response_prompt(
    user_message: str,
    bot_settings: dict[str, Any] | None,
    *,
    verified_settings_block: str = "",
) -> str:
    """Prompt para generar respuesta libre en intent `other`, anclada a DATOS_VERIFICADOS del negocio."""

    system_prompt = build_system_prompt(bot_settings)
    facts = str(verified_settings_block or "").strip() or "(sin configuracion adicional del negocio en este bloque)"
    facts = append_bot_message_templates_to_verified_block(facts, bot_settings)
    welcome_rule = ""
    if _optional_text((bot_settings or {}).get("welcomeMessage")):
        welcome_rule = (
            "- Si MENSAJES_PREDEFINIDOS_VERIFICADOS incluye mensaje_bienvenida_literal y el usuario saluda "
            "o inicia conversacion, responde con ese texto (literal o variante minima sin cambiar el sentido).\n"
        )
    return (
        f"{system_prompt}\n\n"
        "RESPUESTA_CONVERSACIONAL_OTRO:\n"
        "Eres CarAdvisor. Responde de forma natural y contextual al ultimo mensaje del usuario.\n"
        "A continuacion aparece DATOS_VERIFICADOS: configuracion/estilo del bot, perfil del negocio (si existe), "
        "mensajes predefinidos (si existen) y mensaje del usuario. "
        "No inventes inventario, precios, promociones, planes de financiamiento ni disponibilidad de vehiculos.\n"
        "Reglas:\n"
        f"{welcome_rule}"
        "- Solo saluda si el usuario esta saludando explicitamente o si el mensaje parece de inicio de conversacion o es primer mensaje del usuario.\n"
        "- Si el usuario agradece (por ejemplo: gracias, muchas gracias), responde agradeciendo de vuelta "
        "(por ejemplo: con gusto/de nada) y NO vuelvas a saludar.\n"
        "- Si no hay saludo ni agradecimiento, responde sin saludo de apertura.\n"
        "- Puedes invitar a preguntar por marcas/modelos o dudas generales; no cites modelos concretos que no esten en DATOS_VERIFICADOS.\n"
        "- Cierra ofreciendo resolver dudas dentro de lo que el negocio permite.\n\n"
        "DATOS_VERIFICADOS:\n"
        f"{facts}\n\n"
        f"Ultimo mensaje del usuario: {user_message}\n"
    )


_VERIFIED_MODE_INSTRUCTIONS: dict[str, str] = {
    "catalog_availability": (
        "TAREA: Presenta el catalogo o disponibilidad al usuario.\n"
        "Respuesta corta y facil de leer en chat; el listado ya aporta detalle, no lo alargues con prosa extra.\n"
        "El bloque DATOS_VERIFICADOS incluye el listado agrupado del inventario (o mensaje de vacio del sistema) "
        "y puede incluir la ultima pregunta del usuario y banderas (por ejemplo si pidio un modelo no disponible).\n"
        "Redacta en espanol (Mexico) un mensaje unico para el chat: tono de consultor de agencia.\n"
        "Si DATOS_VERIFICADOS incluye criterio_sin_coincidencias, di claramente que no hay vehiculos que cumplan ese "
        "criterio y muestra el listado disponible; NO preguntes si quiere ver todos ni ofrezcas mostrar el catalogo despues.\n"
        "Si DATOS_VERIFICADOS contiene un listado de vehiculos, COPIALO TAL CUAL en tu respuesta en una seccion clara "
        "(mismas lineas y datos).\n"
        "Si DATOS_VERIFICADOS incluye intro_sugerido_literal, usa ESA frase literal justo antes del listado; "
        "NO inventes otra introduccion generica (evita 'Aqui tienes los modelos disponibles').\n"
        "NO ofrezcas ayuda para comparar modelos ni agregues frases de cierre sobre comparar.\n"
        "Si el listado indica que no hay vehiculos, dilo con naturalidad sin inventar unidades.\n"
        "No inventes marcas, modelos, precios ni anos que no aparezcan en DATOS_VERIFICADOS.\n"
        "Devuelve UNICAMENTE el mensaje para el usuario, sin titulos ni prefijos tipo 'Respuesta:'."
    ),
    "catalog_prose_only": (
        "TAREA: Escribe SOLO texto de enlace (maximo 3 oraciones cortas) para acompanar un listado de inventario "
        "que el sistema mostrara justo despues de tu mensaje.\n"
        "Usa exclusivamente hechos que puedas inferir del bloque DATOS_VERIFICADOS (resumen o banderas); "
        "NO copies ni enumeres el listado de vehiculos ni lineas numeradas del bloque; NO repitas precios ni tablas.\n"
        "Si el usuario busco algo no disponible, reconocelo solo si consta en DATOS_VERIFICADOS.\n"
        "Cierra invitando a elegir un modelo. NO ofrezcas ayuda para comparar.\n"
        "Devuelve UNICAMENTE el texto puente, sin titulos ni prefijos."
    ),
    "inventory_candidates": (
        "TAREA: El usuario debe elegir entre varios vehiculos candidatos.\n"
        "DATOS_VERIFICADOS contiene LISTA_OPCIONES numerada: debes mantenerla EXACTA (mismos numeros, textos y saltos de linea) "
        "dentro de tu respuesta.\n"
        "Agrega una introduccion breve y una instruccion final para responder con nombre o numero.\n"
        "No inventes vehiculos extra. Espanol (Mexico). Un solo mensaje. Sin prefijos tipo 'Respuesta:'."
    ),
    "inventory_search_empty": (
        "TAREA: Informar que la busqueda no arrojo vehiculos con los criterios dados.\n"
        "Usa solo lo que conste en DATOS_VERIFICADOS (filtros resumidos, resultado 0, etc.). "
        "Ofrece mostrar el catalogo completo o afinar la busqueda, sin inventar existencias.\n"
        "Un solo mensaje breve. Espanol (Mexico)."
    ),
    "filtered_vehicles_followup": (
        "TAREA: El usuario hizo una busqueda por caracteristicas; DATOS_VERIFICADOS incluye el listado formateado.\n"
        "Si hay criterio_busqueda, mencionalo de forma breve al presentar los resultados (sin inventar coincidencias).\n"
        "Mantén el listado exacto dentro de tu respuesta si aparece en DATOS_VERIFICADOS.\n"
        "Agrega una sola frase de cierre pidiendo el nombre exacto del vehiculo de interes.\n"
        "No inventes datos. Espanol (Mexico). Sin prefijos."
    ),
    "operational": (
        "TAREA: Comunicar un estado operativo al usuario (error de sistema, recurso no disponible, accion no permitida, etc.).\n"
        "Usa SOLO lo que conste en DATOS_VERIFICADOS (operacion, ids, exito/fallo, mensajes literales del backend si vienen).\n"
        "No inventes codigos HTTP, stack traces ni detalles tecnicos no listados.\n"
        "Sé breve, empatico y claro. Espanol (Mexico). Un solo mensaje. Sin prefijos."
    ),
    "financing_prose_only": (
        "TAREA: Redacta un mensaje CONVERSACIONAL breve (parrafos cortos) que explique los planes de financiamiento del bloque "
        "DATOS_VERIFICADOS, incluyendo los datos clave de cada plan (nombre, tasa, plazo y requisitos cuando existan).\n"
        "Mantén la respuesta escaneable en chat: prioriza datos clave y evita alargar sin necesidad.\n"
        "NO uses formato de lista ni numeracion en la salida (sin bullets, sin 1., 2., etc.).\n"
        "No inventes planes, condiciones ni requisitos. Usa solo lo que conste en DATOS_VERIFICADOS.\n"
        "Cuando te refieras a un plan concreto, usa el nombre exacto tal como aparece en DATOS_VERIFICADOS (no inventes apodos ni abreviaturas).\n"
        "Cierra con una invitacion breve para que el usuario elija un plan. Espanol (Mexico). Sin prefijos."
    ),
    "financing_plan_vehicle": (
        "TAREA: Presentar el vehiculo vinculado a un plan de financiamiento y motivar la siguiente accion.\n"
        "Respuesta corta y facil de leer en chat; evita parrafos largos.\n"
        "DATOS_VERIFICADOS incluye datos del plan y la ficha del vehiculo (texto del sistema). "
        "Puedes integrar la ficha tal cual en una seccion si el bloque la trae formateada, o parafrasear solo "
        "si no contradices valores (mejor mantener la ficha literal si ya viene en el bloque).\n"
        "No inventes condiciones de credito no listadas. Espanol (Mexico). Un solo mensaje."
    ),
    "promotion_prose_only": (
        "TAREA: Redacta un mensaje CONVERSACIONAL breve (parrafos cortos) que explique las promociones del bloque "
        "DATOS_VERIFICADOS, incluyendo para cada una los datos clave (titulo, descripcion, vigencia y vehiculos aplicables cuando existan).\n"
        "Mantén la respuesta escaneable en chat: prioriza datos clave y evita alargar sin necesidad.\n"
        "NO uses formato de lista ni numeracion en la salida (sin bullets, sin 1., 2., etc.).\n"
        "No inventes promociones, vigencias ni vehiculos aplicables. Usa solo lo que conste en DATOS_VERIFICADOS.\n"
        "Cierra con una invitacion breve para que el usuario indique cual promocion le interesa aplicar. "
        "Espanol (Mexico). Sin prefijos."
    ),
    "promotion_vehicle_confirm": (
        "TAREA: Mostrar la ficha del vehiculo bajo una promocion y pedir confirmacion de interes.\n"
        "Respuesta corta y facil de leer en chat; evita parrafos largos.\n"
        "DATOS_VERIFICADOS incluye ficha formateada y titulo/datos de la promocion. No inventes beneficios no listados.\n"
        "Un solo mensaje. Espanol (Mexico)."
    ),
    "promotion_list_message": (
        "TAREA: Presentar promociones aplicables al usuario.\n"
        "Si DATOS_VERIFICADOS contiene listado formateado de promociones, incluyelo TAL CUAL en tu respuesta.\n"
        "Agrega instrucciones claras para elegir o confirmar segun lo que indique el bloque.\n"
        "No inventes promociones. Espanol (Mexico)."
    ),
    "lead_capture_scheduling": (
        "TAREA: Instrucciones claras para agendar prueba de manejo o ver el vehiculo en persona.\n"
        "DATOS_VERIFICADOS incluye vehiculo_seleccionado, url_agenda_literal (URL exacta a copiar) y confirmacion_cita_correo.\n"
        "Estructura obligatoria en tu respuesta:\n"
        "1) Menciona el vehiculo por nombre (vehiculo_seleccionado).\n"
        "2) Indica que para prueba de manejo o ver el auto en persona debe usar el enlace.\n"
        "3) Pasos numerados o viñetas: abrir el link → elegir fecha y hora → completar datos en el formulario → confirmar.\n"
        "4) Incluye la URL literal de url_agenda_literal tal cual (copiable).\n"
        "5) Al confirmar la cita en el calendario recibira un correo (segun confirmacion_cita_correo).\n"
        "PROHIBIDO: pedir nombre, telefono o correo por chat; inventar otra URL; fechas/horas concretas del negocio.\n"
        "Espanol (Mexico). Tono cercano. Lista corta o 2-4 frases. Sin prefijos."
    ),
    "faq_insufficient": (
        "TAREA: Indicar que no hay suficiente informacion en la base FAQ para responder con precision.\n"
        "Si MENSAJES_PREDEFINIDOS_VERIFICADOS incluye mensaje_fallback_faq_literal, usalo como respuesta "
        "(literal o variante minima sin cambiar el sentido); tiene prioridad sobre redaccion libre.\n"
        "Revisa PERFIL_NEGOCIO_VERIFICADO si existe en DATOS_VERIFICADOS; si contiene el dato, respondelo.\n"
        "Si no hay evidencia en FAQ ni en PERFIL_NEGOCIO_VERIFICADO, ofrece ayuda general (catalogo, planes, contacto) "
        "sin inventar datos del negocio.\n"
        "Breve. Espanol (Mexico)."
    ),
    "faq_resume_transition": (
        "TAREA: Generar UNA sola pregunta breve de reanudacion del flujo comercial interrumpido.\n"
        "DATOS_VERIFICADOS incluye paso_a_reanudar, contexto_del_paso, estado_flujo, ultimo_mensaje_bot y mensaje_usuario_faq.\n"
        "La pregunta debe retomar lo que el bot estaba pidiendo en ultimo_mensaje_bot y el estado_flujo, no un guion generico.\n"
        "Si esperando_preferencia_contacto o esperando_confirmacion_compra es true: retoma preferencia de contacto "
        "(whatsapp, llamada o cita); PROHIBIDO preguntar solo si/no a prueba de manejo.\n"
        "Si esperando_preferencias_compra es true: retoma transmision (automatico/estandar) y pago (contado/financiado).\n"
        "Si vehiculo_seleccionado no es (ninguno): PROHIBIDO preguntar si quiere ver catalogo, modelos disponibles, marcas "
        "o si tiene vehiculo en mente; retoma el paso concreto (preferencia de contacto, detalle, imagenes, etc.).\n"
        "Si plan_financiamiento_seleccionado no es (ninguno): no pidas elegir plan desde cero; continua con ese plan.\n"
        "Si promocion_seleccionada no es (ninguno): no pidas elegir promocion desde cero; continua con esa promocion.\n"
        "No repitas ni respondas la duda FAQ del usuario (eso va en otro mensaje).\n"
        "No inventes datos del negocio, horarios, direcciones ni politicas.\n"
        "PROHIBIDO: agendar citas con fecha, hora, dia o lugar; prometer que coordinaras agenda.\n"
        "Puedes usar un conector minimo (ej. Perfecto, Claro) antes de la pregunta.\n"
        "Maximo 1-2 oraciones. Debe terminar en pregunta. Espanol (Mexico). Sin prefijos."
    ),
    "faq_turn": (
        "TAREA: Responder la duda del usuario usando BASE_FAQ_DESDE_BD y, si aplica, PERFIL_NEGOCIO_VERIFICADO "
        "dentro de DATOS_VERIFICADOS.\n"
        "Prioriza BASE_FAQ_DESDE_BD; si no contiene la respuesta, usa solo datos en PERFIL_NEGOCIO_VERIFICADO.\n"
        "No inventes horarios, direcciones, politicas ni datos que no aparezcan en esos bloques.\n"
        "Si faq_respuesta_compacta es true, limita la parte de la respuesta FAQ a un solo parrafo corto (idea principal).\n"
        "Despues de la respuesta FAQ, si transicion_literal no es '(ninguna)', integra esa pregunta de transicion "
        "de forma natural (conectores y mayusculas; conserva el sentido de la pregunta).\n"
        "Al final, si cierre_literal no es '(ninguno)', incluye esa pregunta o cierre de forma natural.\n"
        "Si cierre_literal es '(ninguno)': PROHIBIDO inventar pregunta de cierre, cita, compra o contacto.\n"
        "Si tema_faq_cierre es horarios o ubicacion: responde solo la informacion pedida; "
        "PROHIBIDO sugerir catalogo, comprar o ver un carro salvo que cierre_literal lo indique.\n"
        "Un solo mensaje coherente. Espanol (Mexico). Sin prefijos tipo 'Respuesta:'."
    ),
}


def build_verified_user_message_prompt(
    mode: str,
    verified_facts_block: str,
    user_message: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt unificado: mensaje al usuario solo anclado a DATOS_VERIFICADOS."""

    system_prompt = build_system_prompt(bot_settings)
    task = _VERIFIED_MODE_INSTRUCTIONS.get(mode.strip())
    if not task:
        task = _VERIFIED_MODE_INSTRUCTIONS["operational"]
    um = str(user_message or "").strip() or "(sin mensaje reciente del usuario)"
    facts = str(verified_facts_block or "").strip() or "(vacío)"
    return (
        f"{system_prompt}\n\n"
        f"MODO: {mode.strip()}\n\n"
        f"{task}\n\n"
        f"Ultimo mensaje del usuario (contexto): {um}\n\n"
        "DATOS_VERIFICADOS:\n"
        f"{facts}\n"
    )


def build_vehicle_detail_conversation_prompt(
    vehicle_name: str,
    grounded_facts_block: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt para narrar el detalle del vehiculo con tono de vendedor, anclado solo a hechos verificados."""

    system_prompt = build_system_prompt(bot_settings)
    name = vehicle_name.strip() or "este vehiculo"
    facts = str(grounded_facts_block or "").strip()
    return (
        f"{system_prompt}\n\n"
        "NARRATIVA_DETALLE_VEHICULO (solo datos verificados):\n"
        f"Nombre del vehiculo en inventario: {name}\n\n"
        "A continuacion aparece el bloque DATOS_VERIFICADOS. Es la UNICA fuente de verdad. "
        "Proviene del sistema/inventario; no contiene opiniones externas.\n\n"
        "DATOS_VERIFICADOS:\n"
        f"{facts}\n\n"
        "Instrucciones obligatorias:\n"
        "- Redacta en espanol (Mexico) un texto conversacional breve, como un consultor de agencia presentando el auto en chat; "
        "prioriza legibilidad (parrafos cortos) y evita alargar sin necesidad.\n"
        "- Usa SOLO informacion que aparezca literalmente en DATOS_VERIFICADOS (mismos valores: km, motor, etc.). "
        "No inventes equipamiento, garantias, historial, consumo, seguridad, financiamiento, promociones ni disponibilidad extra.\n"
        "- No agregues cifras, fechas ni hechos que no esten en el bloque.\n"
        "- No menciones color, tonalidad ni pintura del vehiculo a menos que DATOS_VERIFICADOS incluya la linea Color.\n"
        "- No menciones dimensiones, medidas, longitud, ancho, altura ni distancia entre ejes a menos que DATOS_VERIFICADOS "
        "incluya esas lineas (el usuario debe pedirlas explicitamente para que aparezcan).\n"
        "- Incluye de forma natural solo los campos que aparezcan en DATOS_VERIFICADOS (marca, modelo, año, precio, kilometraje o estado, "
        "transmision, motor y descripcion cuando exista). Si no hay linea Descripcion o algún otro campo, omitela por completo; no digas que falta ni que no esta disponible a menos que te hayan preguntado sobre eso específicamente.\n"
        "- Transmision (obligatorio si hay linea Transmision en DATOS_VERIFICADOS): di siempre 'manual' y/ o 'automatica' "
        "con esas palabras. CVT, TA, automatic y similares cuentan como automatica; TM, mecanica o 'de N velocidades' "
        "sin automatica cuentan como manual. Si el dato trae ambas (ej. 'manual de 5 velocidades / CVT' o 'TA / TM'), "
        "di explicitamente que hay transmision manual y automatica (puedes aclarar entre parentesis el detalle tecnico "
        "como CVT o el numero de velocidades). Nunca digas solo 'CVT' u otro acronimo sin aclarar que es automatica; "
        "los clientes se confunden.\n"
        "- Si mencionas el precio, usa siempre la formulacion 'a partir de' + el monto exacto de DATOS_VERIFICADOS "
        "(no lo presentes como precio cerrado ni omitas 'a partir de').\n"
        "- Si algun otro valor figura como N/D, dilo con naturalidad sin inventar detalles.\n"
        "- Si en DATOS_VERIFICADOS figura Estado Nuevo (unidad sin kilometraje o 0 km en inventario), NO menciones '0 km', "
        "'cero kilometros' ni expresiones equivalentes; puedes describirlo como vehiculo nuevo de forma natural o omitir por completo el tema del kilometraje.\n"
        "- No uses listas con viñetas ni formato 'Etiqueta: valor' en lineas separadas; integra todo en parrafos o frases enlazadas.\n"
        "- Evita markdown de tablas o listas; maximo un salto de linea entre dos parrafos cortos si ayuda a la lectura.\n"
        "- No agregues cierre invitando a pedir mas informacion, ver otros modelos, seguir explorando el catalogo\n"
        "- Termina el texto al describir el vehiculo segun DATOS_VERIFICADOS, sin preguntas ni ofertas de catalogo adicional.\n"
        "- Devuelve UNICAMENTE el mensaje para el usuario, sin titulos, sin prefijos tipo 'Respuesta:' ni comillas."
    )


def build_vehicle_detail_pitch_copy_prompt(
    vehicle_name: str,
    facts_block: str,
    bot_settings: dict[str, Any] | None,
    *,
    has_tagline: bool,
) -> str:
    """Prompt para tagline/cierre cortos del pitch; no reescribe bullets ni precio."""

    system_prompt = build_system_prompt(bot_settings)
    name = vehicle_name.strip() or "este vehiculo"
    facts = str(facts_block or "").strip()
    if has_tagline:
        mode_rules = (
            "- Ya existe TAGLINE editorial en inventario; NO inventes ni reescribas tagline.\n"
            "- Devuelve SOLO una linea exactamente asi:\n"
            "CIERRE: <una frase corta en espanol Mexico>\n"
        )
    else:
        mode_rules = (
            "- No hay tagline en inventario; genera TAGLINE y CIERRE.\n"
            "- Devuelve exactamente estas dos lineas (sin extras):\n"
            "TAGLINE: <una frase corta tipo gancho comercial>\n"
            "CIERRE: <una frase corta de cierre>\n"
        )
    return (
        f"{system_prompt}\n\n"
        "PITCH_COPY_DETALLE_VEHICULO (solo datos verificados):\n"
        f"Nombre del vehiculo: {name}\n\n"
        "DATOS_VERIFICADOS (estructura ya armada; no la reescribas):\n"
        f"{facts}\n\n"
        "Instrucciones obligatorias:\n"
        "- Espanol (Mexico), tono consultor de agencia, frases muy cortas.\n"
        "- Usa SOLO hechos que aparezcan en DATOS_VERIFICADOS. No inventes equipamiento, seguridad, ADAS, bolsas, "
        "camaras, consumo, financiamiento, promociones ni ranking de ventas.\n"
        "- No uses emojis, viñetas, listas, markdown ni preguntas.\n"
        "- No invites a ver otros modelos, pedir mas info ni explorar el catalogo.\n"
        f"{mode_rules}"
        "- Si no puedes redactar un cierre util sin inventar, deja CIERRE vacio: CIERRE:\n"
        "- Devuelve UNICAMENTE las lineas pedidas, sin prefijos tipo 'Respuesta:' ni comillas envolventes."
    )


def build_vehicle_comparison_conversation_prompt(
    vehicle_name_a: str,
    vehicle_name_b: str,
    grounded_facts_block: str,
    user_message: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt para comparar dos unidades con tono consultivo, solo con hechos de inventario."""

    system_prompt = build_system_prompt(bot_settings)
    name_a = vehicle_name_a.strip() or "primer vehiculo"
    name_b = vehicle_name_b.strip() or "segundo vehiculo"
    facts = str(grounded_facts_block or "").strip()
    um = str(user_message or "").strip() or "(sin mensaje reciente del usuario)"
    return (
        f"{system_prompt}\n\n"
        "NARRATIVA_COMPARACION_DOS_VEHICULOS (solo datos verificados):\n"
        f"Unidad A: {name_a}\n"
        f"Unidad B: {name_b}\n\n"
        "A continuacion aparece el bloque DATOS_VERIFICADOS con las fichas VEHICULO_A y VEHICULO_B. "
        "Es la UNICA fuente de verdad; no contiene opiniones externas.\n\n"
        "DATOS_VERIFICADOS:\n"
        f"{facts}\n\n"
        f"Contexto del usuario (pedido de comparacion): {um}\n\n"
        "Instrucciones obligatorias:\n"
        "- Redacta en espanol (Mexico) un texto conversacional breve: como un consultor que contrasta las dos unidades en chat; "
        "prioriza legibilidad (parrafos cortos) y evita alargar sin necesidad.\n"
        "- Usa SOLO informacion que aparezca en DATOS_VERIFICADOS para ambas unidades (mismos valores: km, motor, etc.). "
        "No inventes equipamiento, garantias, historial, consumo, seguridad, financiamiento, promociones ni datos que no esten en las fichas.\n"
        "- Menciona a ambos vehiculos de forma clara (puedes usar los nombres de las secciones o marca/modelo/año del bloque).\n"
        "- No menciones color, tonalidad ni pintura salvo que ambas fichas en DATOS_VERIFICADOS incluyan la linea Color.\n"
        "- No menciones dimensiones, medidas, longitud, ancho, altura ni distancia entre ejes a menos que DATOS_VERIFICADOS "
        "incluya esas lineas en las fichas (solo cuando el usuario las pide explicitamente).\n"
        "- Contrasta de forma natural lo que difiere segun los campos presentes en DATOS_VERIFICADOS (kilometraje, motor, año, descripcion, estado, precio); "
        "no menciones descripcion si no aparece en alguna ficha.\n"
        "- Si mencionas transmision: usa 'manual' y / o 'automatica' (CVT/TA = automatica). Si hay ambas opciones, dilo "
        "como manual y automatica; no digas solo 'CVT' sin aclarar que es automatica.\n"
        "- Si mencionas precios, usa siempre 'a partir de' + el monto exacto de cada ficha en DATOS_VERIFICADOS "
        "(no los presentes como precio cerrado).\n"
        "- No uses listas con viñetas ni formato tabla 'campo | A | B' ni lineas tipo 'Etiqueta: valor' repetidas como ficha; integra todo en parrafos o frases enlazadas.\n"
        "- Evita markdown de tablas; como maximo un salto de linea entre dos parrafos cortos si ayuda a la lectura.\n"
        "- No cierres con una pregunta fija literal obligatoria: el sistema agregara el cierre. Termina el texto despues de la comparacion, "
        "por ejemplo con una frase breve que invite a seguir la conversacion sin prometer datos fuera de DATOS_VERIFICADOS.\n"
        "- Devuelve UNICAMENTE el mensaje para el usuario, sin titulos, sin prefijos tipo 'Respuesta:' ni comillas."
    )


def build_selected_vehicle_qa_prompt(
    vehicle_name: str,
    grounded_facts_block: str,
    user_message: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt para responder dudas puntuales del vehiculo en pantalla usando solo la ficha de inventario."""

    system_prompt = build_system_prompt(bot_settings)
    name = vehicle_name.strip() or "este vehiculo"
    facts = str(grounded_facts_block or "").strip()
    question = user_message.strip() or "(mensaje vacio)"
    return (
        f"{system_prompt}\n\n"
        "RESPUESTA_PREGUNTAS_SOBRE_VEHICULO (fuente inventario / BD):\n"
        f"El usuario esta viendo el vehiculo: {name}\n\n"
        "DATOS_VERIFICADOS (unica fuente de verdad):\n"
        f"{facts}\n\n"
        f"PREGUNTA_DEL_USUARIO: {question}\n\n"
        "Instrucciones obligatorias:\n"
        "- Responde en espanol (Mexico), tono claro y breve (1-3 oraciones salvo que la pregunta exija un poco mas).\n"
        "- Usa EXCLUSIVAMENTE informacion que aparezca en DATOS_VERIFICADOS (mismos valores: kilometraje, motor, "
        "descripcion, dimensiones, pasajeros, consumo u otra informacion adicional listada). "
        "No inventes equipamiento, garantias, historial, consumo, revisiones, financiamiento ni promociones.\n"
        "- Si preguntan por color, tonalidad o pintura, respondelo solo si DATOS_VERIFICADOS incluye la linea Color; "
        "si no esta en el bloque, dilo con naturalidad y sugiere que el equipo pueda confirmarlo.\n"
        "- No menciones dimensiones, medidas, longitud, ancho, altura ni distancia entre ejes a menos que el usuario "
        "las pida explicitamente en PREGUNTA_DEL_USUARIO y ademas esas lineas aparezcan en DATOS_VERIFICADOS.\n"
        "- Si preguntan por dimensiones, rendimiento/consumo, pasajeros u otra informacion adicional, "
        "respondelo solo con las lineas que aparezcan en DATOS_VERIFICADOS; si no estan, dilo con naturalidad "
        "y sugiere que el equipo pueda confirmarlo.\n"
        "- Si hablas de transmision: usa siempre las palabras 'manual' y / o 'automatica'. CVT, TA y similares son "
        "automatica; si el dato trae ambas opciones, di 'manual y automatica' (puedes aclarar CVT u otro detalle "
        "entre parentesis). No digas solo 'CVT' sin aclarar que es automatica.\n"
        "- Si preguntan explicitamente por descripcion y no hay linea Descripcion en DATOS_VERIFICADOS, dilo con naturalidad "
        "y sugiere que el equipo pueda confirmarlo; si no viene la descripción, no menciones que no esta disponible a menos que te hayan preguntado sobre eso específicamente.\n"
        "- Si el dato no esta en DATOS_VERIFICADOS o figura como N/D, dilo con naturalidad y sugiere que el equipo pueda confirmarlo.\n"
        "- Si la pregunta es sobre precio/costo y el monto aparece en DATOS_VERIFICADOS, responde siempre con "
        "'a partir de' + el monto exacto (ej. 'a partir de $450,000.00'); no digas que ese es el precio fijo.\n"
        "- No repitas toda la ficha: centrate en lo que pregunto el usuario.\n"
        "- No saludes ni menciones que eres una IA.\n"
        "- Evita listas largas con viñetas; texto corrido.\n"
        "- Devuelve UNICAMENTE el mensaje para el usuario, sin prefijos tipo 'Respuesta:'.\n"
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
        "- SI: el usuario confirma compra o quiere avanzar con apartar/comprar; tambien cuando el mensaje previo del bot "
        "ofrecio prueba de manejo o ver el vehiculo en persona y el usuario acepta, pide agendar, quiere probar o visitar "
        "(ej. 'si', 'quiero una prueba de manejo', 'me interesa verlo en persona'; tolera typos como 'prubea' o 'maneja'). "
        "Un 'gracias' solo o cortesia sin aceptar de forma clara NO es SI.\n"
        "- NO: el usuario rechaza compra.\n"
        "- VER_MODELO: el usuario quiere seguir viendo opciones, otros modelos, o cambiar de vehiculo (incluye preguntas "
        "centradas en otro modelo distinto al que se esta mostrando).\n"
        "- VER_MAS_IMAGENES: el usuario pide ver mas fotos/imagenes del vehiculo actual.\n"
        "- PREGUNTA_MODELO: el usuario pregunta datos del vehiculo que ya esta en contexto (precio, kilometraje, motor, "
        "transmision, color, descripcion, año, dimensiones, pasajeros, consumo u otra informacion adicional, etc.) "
        "sin confirmar ni rechazar compra, similar a una mini-FAQ anclada al inventario. "
        "No uses PREGUNTA_MODELO si claramente pide otro carro distinto (eso es VER_MODELO).\n"
        "- UNKNOWN: no encaja en ninguna categoria anterior o es ambiguo. Usa UNKNOWN si el usuario pide tiempo, "
        "aplaza la decision o pide esperar sin aceptar ni rechazar (ej. 'gracias permitame', 'permitame', "
        "'deme un momento', 'un momento', 'espereme', 'ahorita regreso', 'dejeme pensarlo', 'lo reviso y le digo'). "
        "Eso NO es confirmacion de cita ni de compra.\n"
        "Responde SOLO con una de estas etiquetas exactas: SI, NO, VER_MODELO, VER_MAS_IMAGENES, PREGUNTA_MODELO, UNKNOWN.\n\n"
        f"Mensaje previo del bot: {previous}\n"
        f"Mensaje del usuario: {current}\n"
    )


def build_purchase_preferences_classifier_prompt(
    previous_bot_message: str,
    user_message: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt clasificador determinista para transmision y forma de pago post-seleccion."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_PREFERENCIAS_COMPRA:\n"
        "El bot pregunto transmision (Automatico o Estandar) y forma de pago (contado o financiado).\n"
        "Con el mensaje previo del bot y la respuesta del usuario, clasifica ambas preferencias.\n"
        "Responde SOLO con un objeto JSON en una sola linea, sin markdown, con este formato exacto:\n"
        '{"transmission":"<ETIQUETA>","payment_type":"<ETIQUETA>"}\n'
        "Etiquetas validas de transmission: AUTOMATICO, ESTANDAR, UNKNOWN.\n"
        "Etiquetas validas de payment_type: CONTADO, FINANCIADO, UNKNOWN.\n"
        "Reglas:\n"
        "- Usa el contexto del mensaje previo del bot para resolver ambiguedad.\n"
        "- Si el usuario menciona ambas opciones de una misma pregunta (ej. automatico y estandar), "
        "elige la que el contexto indique como preferencia final; si no hay evidencia clara, UNKNOWN.\n"
        "- Sinonimos: automatica/CVT/TA => AUTOMATICO; manual/stick => ESTANDAR; "
        "efectivo/cash/de contado => CONTADO; credito/a meses/financiamiento => FINANCIADO.\n"
        "- No inventes: si no hay evidencia para un campo, usa UNKNOWN en ese campo.\n"
        "- El usuario puede responder ambas preguntas en un solo mensaje.\n\n"
        f"Mensaje previo del bot: {previous}\n"
        f"Mensaje del usuario: {current}\n"
    )


def build_contact_method_classifier_prompt(
    previous_bot_message: str,
    user_message: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt clasificador para preferencia de contacto post-seleccion."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_METODO_CONTACTO:\n"
        "El bot pregunto como prefiere ser contactado: WhatsApp (por aqui/por mensaje), "
        "llamada telefonica, o agendar una cita.\n"
        "Con el mensaje previo del bot y la respuesta del usuario, clasifica UNA preferencia.\n"
        "Responde SOLO con una de estas etiquetas exactas: WHATSAPP, CALL, APPOINTMENT, UNKNOWN.\n"
        "Reglas:\n"
        "- WHATSAPP: por aqui, por mensaje, whatsapp, wsp, wa, este chat/canal.\n"
        "- CALL: llamada, llamar, telefono, me llamen, llamame, llamenme, marquenme, me marquen, call.\n"
        "- APPOINTMENT: cita, agendar, visita, ver en persona, prueba de manejo.\n"
        "- Si menciona mas de una opcion sin dejar clara la preferencia final, UNKNOWN.\n"
        "- Un 'si' solo (sin indicar canal) no basta: UNKNOWN.\n"
        "- No inventes: sin evidencia clara usa UNKNOWN.\n\n"
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


def build_faq_selection_prompt(
    user_question: str,
    faq_catalog: str,
    *,
    max_candidates: int,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Clasificador: elige indices de FAQ del catalogo que responden la pregunta del usuario."""

    system_prompt = build_system_prompt(bot_settings)
    question = user_question.strip() or "(mensaje vacio)"
    catalog = faq_catalog.strip() or "(sin FAQs en catalogo)"
    max_n = max(1, int(max_candidates))
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_SELECCION_FAQ:\n"
        "El usuario hizo una pregunta sobre el negocio. Abajo hay un catalogo numerado de FAQs (pregunta/respuesta).\n"
        "Tu tarea es identificar cuales entradas del catalogo responden correctamente la pregunta del usuario.\n"
        "Responde SOLO con un objeto JSON en una sola linea, sin comentarios ni markdown. Formato exacto:\n"
        '{"indices": [<enteros 1-based>], "sin_match": <bool>}\n\n'
        "Reglas:\n"
        "- Usa coincidencia semantica, no literal: plurales/singulares, sinonimos y reformulaciones cuentan "
        "(ej. 'horarios' con FAQ 'horario', 'donde estan' con FAQ de direccion).\n"
        f"- Devuelve como maximo {max_n} indices, ordenados por relevancia (mas relevante primero).\n"
        "- Si ninguna FAQ responde la pregunta, devuelve indices: [] y sin_match: true.\n"
        "- indices debe contener solo numeros validos del catalogo (1..N).\n"
        "- No inventes FAQs que no esten en el catalogo.\n"
        "- Si la pregunta abarca varios temas cubiertos por FAQs distintas, puedes devolver mas de un indice.\n\n"
        f"PREGUNTA_USUARIO: {question}\n\n"
        f"CATALOGO_FAQ:\n{catalog}\n"
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
        "- FINANCING: pide ver, listar, comparar o elegir planes de financiamiento del catalogo; "
        "pregunta tasa, enganche, mensualidad o plazo de un plan concreto o disponible.\n"
        "- PROMOTIONS: pregunta por promociones, ofertas, descuentos o bonos para un vehiculo o en general.\n"
        "- HUMAN_ADVISOR: quiere hablar con un asesor humano, persona real, ejecutivo o que lo comuniquen con alguien del equipo.\n"
        "- FAQ: pregunta informacion general del negocio (ubicacion, horarios, garantias, papeles para comprar, "
        "metodos de pago en caja, politicas del lote, si venden seminuevos/usados o solo nuevos) "
        "sin pedir hablar con un humano.\n"
        "- OTHER: saludo, agradecimiento o mensaje fuera del alcance.\n"
        "Regla importante buró/credito vs financiamiento:\n"
        "- FAQ cuando pregunta POLITICA o REQUISITO del negocio sobre buró/historial crediticio, "
        "sin pedir planes ni tasas: 'revisan buro de credito?', 'consultan buro?', "
        "'necesitan buro crediticio?', 'que pasa si tengo mal buro?' como requisito general.\n"
        "- FINANCING cuando pide planes, opciones de credito, tasas, enganche, mensualidades o plazos "
        "del catalogo: 'que planes de financiamiento tienen?', 'cuales son las tasas?', "
        "'cuanto es el enganche?', 'a cuantos meses puedo financiar?'.\n"
        "- Si solo menciona credito/buro pero la intencion es saber si el negocio lo revisa como requisito, usa FAQ.\n"
        "- Si menciona credito pero pide cotizar, elegir plan o conocer condiciones publicadas, usa FINANCING.\n"
        "Regla importante seminuevos/usados vs catalogo:\n"
        "- FAQ cuando pregunta POLITICA del lote sobre si venden seminuevos, usados o de segunda mano "
        "(ej. 'tienen seminuevos?', 'tienen carros seminuevos?', 'manejan autos usados?', "
        "'venden carros usados?', 'venden de segunda?'). NO es pedido de listado.\n"
        "- VEHICLE_CATALOG cuando pide ver, filtrar o comparar unidades concretas del inventario "
        "(ej. 'muestrame los seminuevos que tengan', 'quiero ver autos usados disponibles', "
        "'que modelos tienen?').\n"
        "Responde SOLO con una etiqueta exacta: VEHICLE_CATALOG, FINANCING, PROMOTIONS, HUMAN_ADVISOR, FAQ, OTHER.\n\n"
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
        '{ "ask_promotions": <bool>, "ask_financing": <bool>, "ask_images": <bool>, "ask_more_images": <bool>, '
        '"wants_compare_two_vehicles": <bool>, "wants_other_vehicles": <bool>, "confirm_purchase": <bool>, "reject_purchase": <bool> }\n'
        "Reglas:\n"
        "- wants_compare_two_vehicles=true cuando quiere comparar dos carros (compara, vs, diferencias, cual conviene mas, "
        "entre X y Y, este contra otro modelo, compara con otro que nombra por marca/modelo, etc.).\n"
        "- ask_promotions=true cuando pide promociones/ofertas/descuentos para el vehiculo actual o en general.\n"
        "- ask_financing=true cuando pide credito/financiamiento/tasa/plazo/mensualidades.\n"
        "- ask_financing=false si solo pregunta el PRECIO o COSTO del vehiculo "
        "(ej. 'cuanto cuesta', 'que precio tiene', 'con que porcion cuesta este vehiculo', "
        "'en cuanto sale', 'cual es el costo'). Eso es pregunta de datos del vehiculo, "
        "no financiamiento: deja todas las claves en false para que se responda con el detalle del vehiculo.\n"
        "- ask_financing=false si pide prueba de manejo, agendar prueba o ver/visitar el vehiculo en persona "
        "(incluye 'quiero una prueba', 'agendar prueba', typos como 'prubea'). En esos casos usa confirm_purchase=true.\n"
        "- ask_images=true cuando pide ver fotos/imagenes del vehiculo actual por primera vez (muestrame fotos, quiero ver imagenes, "
        "tienen fotos del auto, enviar fotos, me puedes enviar fotos, mandame imagenes). "
        "No uses ask_images si solo habla de ver el vehiculo en persona o agendar prueba de manejo.\n"
        "- ask_more_images=true cuando pide mas fotos/imagenes del vehiculo actual despues de un envio previo (mas fotos, siguientes imagenes).\n"
        "- Si es claramente primer pedido de fotos, ask_images=true y ask_more_images=false.\n"
        "- Si el mensaje SOLO indica preferencia de transmision y/o forma de pago "
        "(ej. 'manual', 'estandar', 'automatico', 'CVT', 'cash', 'contado', 'credito', 'financiado', "
        "'manual en cash', 'automatico de contado', 'estandar y credito'), "
        "fuerza ask_images=false, ask_more_images=false y confirm_purchase=false. "
        "Eso NO es pedido de fotos ni confirmacion de compra; es respuesta de preferencias.\n"
        "- wants_other_vehicles=true cuando quiere ver otro modelo/u otro carro/catalogo sin pedir comparacion explícita.\n"
        "- wants_other_vehicles=false si solo pide datos/ficha/informacion/especificaciones/caracteristicas del modelo o vehiculo "
        "ya mostrado (ej. 'dame los datos del modelo', 'muestrame la ficha') sin pedir otro carro ni el catalogo.\n"
        "- wants_other_vehicles=false si pregunta como politica del negocio si venden seminuevos, usados o de segunda mano "
        "(ej. 'tienen seminuevos?', 'tendran seminuevos', 'manejan autos usados?', 'venden carros usados'). "
        "Eso es FAQ de negocio, no pedido de catalogo.\n"
        "- confirm_purchase=true cuando confirma avanzar, comprar el vehiculo actual, o pide/agenda prueba de manejo o "
        "ver/visitar el vehiculo en persona (incluye typos leves: prueba/prubea, manejo/maneja).\n"
        "- confirm_purchase=false si pregunta por el negocio o la agencia: ubicacion, direccion, horarios de atencion, "
        "garantia, politicas del lote, documentos, metodos de pago en caja, contacto de oficina, etc. "
        "Esas preguntas NO son confirmacion de compra aunque el mensaje empiece con 'y' o siga a una FAQ previa.\n"
        "- confirm_purchase=false si el usuario solo agradece, pide tiempo o aplaza sin aceptar (ej. 'gracias', "
        "'gracias permitame', 'permitame', 'deme un momento', 'un momento', 'espereme', 'ahorita regreso', "
        "'dejeme pensarlo', 'lo reviso y le digo'). Eso NO es agendar ni confirmar compra.\n"
        "- Horarios de atencion del negocio (ej. 'que horario manejan', 'a que hora abren') nunca deben marcar confirm_purchase=true.\n"
        "- reject_purchase=true cuando rechaza comprar el vehiculo actual.\n"
        "- Si faltan señales claras, usa false en esas claves.\n\n"
        f"Vehiculo actual: {vehicle}\n"
        f"Mensaje previo del bot: {previous}\n"
        f"Mensaje del usuario: {current}\n"
    )


def build_vehicle_comparison_extract_prompt(
    *,
    previous_bot_message: str,
    user_message: str,
    selected_vehicle_name: str,
    numbered_candidate_lines: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Extrae intencion de comparar y consultas para dos vehiculos (JSON)."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    vehicle = selected_vehicle_name.strip() or "(sin vehiculo seleccionado)"
    candidates = numbered_candidate_lines.strip() or "(sin lista numerada reciente)"
    return (
        f"{system_prompt}\n\n"
        "EXTRACTOR_COMPARACION_VEHICULOS:\n"
        "Responde SOLO con JSON de una linea con estas claves exactas:\n"
        '{ "wants_compare": <bool>, "query_left": <string>, "query_right": <string>, '
        '"use_selected_as_left": <bool>, "use_candidate_indices": <bool>, '
        '"index_left": <number|null>, "index_right": <number|null> }\n'
        "Reglas:\n"
        "- wants_compare=true si el usuario quiere comparar dos vehiculos o ver diferencias entre dos modelos.\n"
        "- use_selected_as_left=true cuando el primer vehiculo es el que ya esta en contexto (vehiculo actual) y el usuario "
        "nombra solo el otro (ej. compara con el que dije antes, vs el de la lista). Entonces query_left debe ser \"\".\n"
        "- query_left y query_right: texto corto para buscar en inventario (marca modelo año). Vacio si no aplica.\n"
        "- use_candidate_indices=true SOLO si hay lista numerada reciente y el usuario elige por numero (ej. compara 1 y 3, el 2 vs 4).\n"
        "- index_left e index_right: numeros 1-based alineados con la lista numerada; null si no usa indices.\n"
        "- Si no es comparacion, wants_compare=false y deja strings vacios y indices null.\n\n"
        f"Vehiculo actual (si aplica): {vehicle}\n"
        f"Lista numerada reciente (si aplica):\n{candidates}\n\n"
        f"Mensaje previo del bot: {previous}\n"
        f"Mensaje del usuario: {current}\n"
    )


def build_promotions_step_flags_prompt(
    *,
    previous_bot_message: str,
    user_message: str,
    current_promotion_title: str,
    numbered_promotion_lines: str,
    selected_vehicle_name: str = "",
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt clasificador por flags para navegacion dentro del nodo promotions."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    promotion = current_promotion_title.strip() or "(sin promocion seleccionada)"
    numbered = numbered_promotion_lines.strip() or "(sin lista numerada reciente)"
    vehicle_ctx = selected_vehicle_name.strip() or "(ninguno)"
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_FLAGS_PROMOTIONS:\n"
        "Responde SOLO con JSON de una linea con estas claves booleanas exactas:\n"
        '{ "ask_financing": <bool>, "ask_other_vehicles": <bool>, "ask_promotions": <bool>, '
        '"wants_compare_two_promotions": <bool>, "select_promotion": <bool>, "apply_promotion": <bool>, '
        '"ask_promotion_vehicle_info": <bool>, "cancel_promotion_flow": <bool>, '
        '"confirm_yes": <bool>, "confirm_no": <bool> }\n'
        "Reglas generales:\n"
        "- Evalua la intencion principal de ESTE turno dentro del flujo de promociones.\n"
        "- Usa true solo cuando haya senales claras; en caso de duda, deja false.\n"
        "- Puedes poner varios flags en true si el mensaje mezcla intenciones, pero evita "
        "marcar apply_promotion=true cuando el usuario solo esta explorando.\n"
        "Definiciones y ejemplos:\n"
        "- ask_financing=true: el usuario pregunta por credito/planes/tasas/plazos/mensualidades "
        "relacionados con una promocion o con la compra en general.\n"
        '  Ejemplos: "y a credito como quedaria?", "que tasa manejan con esa promo?".\n'
        "- ask_other_vehicles=true: quiere ver otros carros/modelos/catalogo fuera del flujo de esta promocion.\n"
        '  Ejemplos: "mejor enseñame otros carros", "quiero ver mas modelos".\n'
        "- ask_promotions=true: sigue hablando de promociones en general (ver mas promos, aclarar condiciones, "
        "relistar) sin elegir/aplicar una en concreto.\n"
        '  Ejemplos: "que otras promociones tienes?", "recúerdame las promos que aplican".\n'
        "- wants_compare_two_promotions=true: pide comparar dos promociones u ofertas (por numero o titulo).\n"
        '  Ejemplos: "compara la 1 y la 3", "cual conviene mas entre mensualidad gratis y bono en efectivo?".\n'
        "- select_promotion=true: el usuario esta eligiendo una promocion de la lista pero sin decir aun que la quiere aplicar.\n"
        '  Ejemplos: "la mensualidad gratis en SUVs", "la numero 2", "me interesa la promo de bonos".\n'
        "- apply_promotion=true: el usuario indica que quiere APLICAR una promocion concreta a su compra.\n"
        '  Ejemplos: "quiero aplicar la mensualidad gratis en SUVs", "aplicame la promo 2", '
        '"usa esa promocion en mi compra", "si, quiero esa promocion".\n'
        "- ask_promotion_vehicle_info=true: el usuario quiere ver o elegir vehiculos que aplican a una promocion.\n"
        '  Ejemplos: "solo quiero ver los carros que aplican a esa promo", '
        '"muestrame los SUVs donde aplica esa promocion", "ensename los coches con esa oferta".\n'
        "- cancel_promotion_flow=true: el usuario quiere salir del flujo de promociones y NO seguir hablando de promos.\n"
        '  Ejemplos: "olvida las promociones", "ya no quiero ver promos", "regresamos al catalogo normal".\n'
        "- confirm_yes=true: respuesta afirmativa clara a una pregunta de confirmacion del bot.\n"
        '  Ejemplos: "si", "claro", "adelante", "me parece bien".\n'
        "- confirm_no=true: respuesta negativa clara a una pregunta de confirmacion del bot.\n"
        '  Ejemplos: "no", "mejor no", "cancela esa promo".\n'
        "- Si un mensaje solo pide detalles de la promocion (beneficios, vigencia) sin elegir ni aplicar, "
        "usa ask_promotions=true y deja select_promotion=false y apply_promotion=false.\n"
        "Vehiculo ya en contexto de la conversacion:\n"
        f"- Vehiculo ya en contexto: {vehicle_ctx}\n"
        "- Si hay vehiculo en contexto (no es \"(ninguno)\") y el usuario expresa interes suave en una "
        "promocion concreta (ej. \"me interesa\", \"suena bien\", \"esa promo\", \"la del bono\", \"me late\") "
        "SIN pedir explicitamente ver o listar los autos aplicables:\n"
        "  * select_promotion=true, apply_promotion=false, ask_promotion_vehicle_info=false\n"
        "- ask_promotion_vehicle_info=true SOLO cuando pide ver, listar o elegir entre los vehiculos de la promo "
        '(ej. "muestrame los carros que aplican", "cuales SUVs entran", "quiero ver el catalogo de esa promo").\n\n'
        f"Promocion actual (si ya hay una seleccionada): {promotion}\n"
        f"Mensaje previo del bot: {previous}\n"
        f"Mensaje del usuario: {current}\n"
        "Lista numerada reciente de promociones (si aplica):\n"
        f"{numbered}\n"
    )


def build_promotion_selection_extract_prompt(
    *,
    previous_bot_message: str,
    user_message: str,
    numbered_promotion_lines: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Extrae que promocion de la lista eligio el usuario (indice o fragmento de titulo)."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    lines = numbered_promotion_lines.strip() or "(sin lista numerada)"
    return (
        f"{system_prompt}\n\n"
        "EXTRACTOR_SELECCION_PROMOCION:\n"
        "El usuario esta en un paso donde debe elegir UNA promocion de la lista numerada.\n"
        "Responde SOLO con JSON de una linea con estas claves exactas:\n"
        '{ "promotion_index": <number|null>, "title_query": <string>, "no_match": <bool> }\n'
        "Reglas:\n"
        "- promotion_index: numero 1-based alineado con la lista numerada (ej. 'la 2', 'numero 1', 'la segunda').\n"
        "- title_query: fragmento corto del titulo tal como lo dijo el usuario (ej. 'mensualidad gratis', 'bono mayo'). "
        "Debe poder mapearse a UN solo renglon de la lista; vacio si usas promotion_index.\n"
        "- no_match=true SOLO si el mensaje no refiere a ninguna promo de la lista (saludo, pregunta general, otro tema).\n"
        "- Si el usuario alude a una promo por palabras clave que aparecen en un solo titulo, "
        "usa title_query con esas palabras y promotion_index=null.\n"
        "- Nunca inventes titulos que no esten en la lista.\n\n"
        f"Promociones listadas:\n{lines}\n\n"
        f"Mensaje previo del bot: {previous}\n"
        f"Mensaje del usuario: {current}\n"
    )


def build_financing_plan_selection_extract_prompt(
    *,
    previous_bot_message: str,
    user_message: str,
    numbered_plan_lines: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Extrae que plan de financiamiento de la lista eligio el usuario (indice o fragmento de nombre)."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    lines = numbered_plan_lines.strip() or "(sin lista numerada)"
    return (
        f"{system_prompt}\n\n"
        "EXTRACTOR_SELECCION_PLAN_FINANCIAMIENTO:\n"
        "El usuario esta en un paso donde debe elegir UN plan de financiamiento de la lista numerada.\n"
        "Responde SOLO con JSON de una linea con estas claves exactas:\n"
        '{ "plan_index": <number|null>, "name_query": <string>, "no_match": <bool> }\n'
        "Reglas:\n"
        "- plan_index: numero 1-based alineado con la lista numerada (ej. 'la 2', 'numero 1', 'la segunda').\n"
        "- name_query: fragmento corto del nombre del plan, prestamista o modelo de vehiculo tal como lo dijo el usuario "
        "(ej. 'jimny 5p', 'financiamiento shilo', 'bbva'). Debe poder mapearse a UN solo renglon de la lista; vacio si usas plan_index.\n"
        "- no_match=true SOLO si el mensaje no refiere a ningun plan de la lista (saludo, pregunta general, otro tema).\n"
        "- Si el usuario alude a un plan por palabras clave que aparecen en un solo renglon (nombre, prestamista o vehiculo), "
        "usa name_query con esas palabras y plan_index=null.\n"
        "- Acepta abreviaturas comunes del usuario (ej. '5p' por '5 puertas') si identifican un solo plan de la lista.\n"
        "- Nunca inventes planes que no esten en la lista.\n\n"
        f"Planes listados:\n{lines}\n\n"
        f"Mensaje previo del bot: {previous}\n"
        f"Mensaje del usuario: {current}\n"
    )


def build_vehicle_pending_selection_extract_prompt(
    *,
    previous_bot_message: str,
    user_message: str,
    numbered_candidate_lines: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Extrae que vehiculo de la lista eligio el usuario (indice o fragmento de nombre)."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    lines = numbered_candidate_lines.strip() or "(sin lista numerada)"
    return (
        f"{system_prompt}\n\n"
        "EXTRACTOR_SELECCION_VEHICULO_PENDIENTE:\n"
        "El usuario esta en un paso donde debe elegir UN vehiculo de la lista numerada.\n"
        "Responde SOLO con JSON de una linea con estas claves exactas:\n"
        '{ "vehicle_index": <number|null>, "name_query": <string>, "no_match": <bool> }\n'
        "Reglas:\n"
        "- vehicle_index: numero 1-based alineado con la lista numerada (ej. 'la 2', 'numero 1', 'opcion 3').\n"
        "- name_query: fragmento corto del nombre/modelo tal como lo dijo el usuario (ej. 'mazda 3', 'el 3', "
        "'cx-5', 'esta bien el 3'). Debe poder mapearse a UN solo renglon de la lista; vacio si usas vehicle_index.\n"
        "- Distingue indice de lista vs digito del modelo: si hay 2 opciones y el usuario dice 'el 3 esta bien' "
        "refiriendose a un modelo con '3' en el nombre (ej. Mazda 3), usa name_query='3' y vehicle_index=null, "
        "NO vehicle_index=3.\n"
        "- Usa vehicle_index SOLO cuando el usuario elige explicitamente por posicion en la lista "
        "(ej. 'opcion 1', 'el segundo', '3' solo si claramente es el tercer renglon y existe).\n"
        "- no_match=true SOLO si el mensaje no refiere a ningun vehiculo de la lista (saludo, pregunta general, otro tema).\n"
        "- Si el usuario alude a un vehiculo por palabras clave que aparecen en un solo renglon, "
        "usa name_query con esas palabras y vehicle_index=null.\n"
        "- Nunca inventes vehiculos que no esten en la lista.\n\n"
        f"Vehiculos listados:\n{lines}\n\n"
        f"Mensaje previo del bot: {previous}\n"
        f"Mensaje del usuario: {current}\n"
    )


def build_financing_step_flags_prompt(
    previous_bot_message: str,
    user_message: str,
    selected_vehicle_name: str,
    has_selected_vehicle: bool,
    has_selected_promotion: bool,
    awaiting_plan_selection: bool,
    awaiting_vehicle_selection: bool,
    numbered_plan_lines: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt clasificador por flags para navegacion en el nodo financing."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    vehicle = selected_vehicle_name.strip() or "(sin vehiculo seleccionado)"
    numbered = numbered_plan_lines.strip() or "(sin lista numerada reciente)"
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_FLAGS_FINANCING_STEP:\n"
        "Responde SOLO con JSON de una linea con estas claves booleanas exactas:\n"
        '{ "ask_promotions": <bool>, "ask_other_vehicles": <bool>, "ask_financing_with_vehicle": <bool>, '
        '"wants_compare_two_plans": <bool>, "select_plan": <bool>, "ask_plan_vehicle_info": <bool>, '
        '"reject_financing_keep_purchase": <bool>, "ask_explicit_plan": <bool> }\n'
        "Reglas generales:\n"
        "- Evalua la intencion principal de ESTE turno dentro del flujo de financiamiento.\n"
        "- Usa true solo cuando haya senales claras; en caso de duda, deja false.\n"
        "- Puedes poner varios flags en true si el mensaje mezcla intenciones, pero evita "
        "marcar select_plan=true cuando el usuario solo explora o compara.\n"
        "Definiciones:\n"
        "- ask_promotions=true: quiere ver o hablar de promociones/ofertas/descuentos, no de planes de credito.\n"
        '  Ejemplos: "tienes promociones?", "mejor cuentame las promos", "que ofertas manejan".\n'
        "- ask_other_vehicles=true: quiere ver catalogo u otros modelos fuera del flujo actual de planes.\n"
        '  Ejemplos: "muestrame otros carros", "quiero ver mas modelos disponibles".\n'
        "- ask_financing_with_vehicle=true: pregunta que planes de credito/financiamiento existen para un vehiculo "
        "concreto (marca/modelo), distinto o mas especifico que el vehiculo ya en contexto.\n"
        '  Ejemplos: "y para un jimny que planes hay?", "financiamiento para versa 2011", "que opciones de pago tienen para ese carro".\n'
        "  NO uses ask_financing_with_vehicle=true si el usuario solo pide ficha, detalles, especificaciones, "
        "fotos o mas informacion del auto sin mencionar planes, credito o financiamiento.\n"
        "- wants_compare_two_plans=true: pide comparar dos planes (por numero, nombre o prestamista).\n"
        '  Ejemplos: "compara el 1 y el 2", "diferencias entre shilo y bbva", "cual conviene mas".\n'
        "- select_plan=true: elige UN plan de la lista numerada sin pedir comparacion.\n"
        '  Ejemplos: "el plan 2", "financiamiento shilo", "me interesa el de bbva", "la 1".\n'
        "- ask_plan_vehicle_info=true: quiere ver datos, detalles, ficha tecnica o fotos del vehiculo "
        "(del plan en contexto o del vehiculo ya consultado), sin pedir listar planes de credito.\n"
        '  Ejemplos: "que carro trae ese plan?", "muestrame el auto del plan shilo", "fotos del vehiculo del plan 1", '
        '"dame mas informacion del jimny", "quiero detalles del vehiculo", "como es ese auto".\n'
        "- reject_financing_keep_purchase=true: rechaza planes pero mantiene intencion de comprar el vehiculo actual.\n"
        '  Ejemplos: "no me interesa ningun plan, solo quiero el carro", "sin financiamiento pero si compro".\n'
        "- ask_explicit_plan=true: sigue ambiguo sobre que plan elegir o no confirma compra sin plan.\n"
        "Reglas criticas:\n"
        "- reject_financing_keep_purchase=true solo con rechazo claro de planes E intencion de compra del carro actual.\n"
        "- ask_explicit_plan=false cuando reject_financing_keep_purchase=true.\n"
        "- Si wants_compare_two_plans=true, pon select_plan=false salvo que tambien elija uno tras comparar.\n"
        "- ask_promotions y ask_financing_with_vehicle pueden coexistir; prioriza ask_financing_with_vehicle "
        "si el mensaje menciona vehiculo y credito/planes a la vez.\n"
        "- Si el mensaje pide mas informacion, detalles o ficha del auto SIN mencionar planes/credito/financiamiento, "
        "usa ask_plan_vehicle_info=true y ask_financing_with_vehicle=false.\n"
        "- Si el mensaje mezcla interes en un plan con pedido de info del vehiculo "
        '(ej. "me interesa el plan pero quiero mas informacion del vehiculo"), usa ask_plan_vehicle_info=true '
        "y select_plan=false.\n"
        "- No marques ask_other_vehicles=true si el usuario solo dice 'carro' dentro de 'quiero comprar el carro' "
        "sin pedir ver catalogo u otros modelos.\n"
        "- select_plan=false si mensaje_previo_bot NO muestra lista numerada de planes "
        '(sin renglones "1.", "2.", ni "Planes disponibles" con opciones concretas).\n'
        "- select_plan=false si mensaje_previo_bot fue respuesta FAQ de requisitos/credito/documentos "
        "o ofrecio contacto con asesor para dudas de credito, aunque awaiting_plan_selection sea true.\n"
        "- Respuestas cortas afirmativas solas ('si', 'claro', 'ok') tras FAQ de credito o oferta de asesor "
        "NO son seleccion de plan; deja select_plan=false.\n\n"
        f"awaiting_plan_selection: {str(awaiting_plan_selection).lower()}\n"
        f"awaiting_vehicle_selection: {str(awaiting_vehicle_selection).lower()}\n"
        f"has_selected_vehicle: {str(has_selected_vehicle).lower()}\n"
        f"has_selected_promotion: {str(has_selected_promotion).lower()}\n"
        f"vehiculo_actual: {vehicle}\n"
        f"mensaje_previo_bot: {previous}\n"
        f"mensaje_usuario: {current}\n"
        "Lista numerada reciente de planes (si aplica):\n"
        f"{numbered}\n"
    )


def build_financing_detail_escalation_prompt(
    *,
    current_node: str,
    previous_bot_message: str,
    user_message: str,
    selected_vehicle_name: str,
    selected_plan_name: str,
    numbered_plan_lines: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Clasifica si una pregunta de credito/financiamiento requiere asesor humano."""

    system_prompt = build_system_prompt(bot_settings)
    node = current_node.strip() or "(sin nodo)"
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    vehicle = selected_vehicle_name.strip() or "(sin vehiculo seleccionado)"
    plan = selected_plan_name.strip() or "(sin plan seleccionado)"
    numbered = numbered_plan_lines.strip() or "(sin lista numerada reciente)"
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_ESCALACION_FINANCIAMIENTO_DETALLADO:\n"
        "Evalua si el mensaje del usuario requiere que un ASESOR HUMANO resuelva dudas de "
        "credito o financiamiento que el bot NO puede contestar con datos publicados del catalogo "
        "ni con FAQs generales del negocio.\n"
        "Responde SOLO con JSON de una linea:\n"
        '{ "requiere_asesor_financiamiento": <bool> }\n'
        "requiere_asesor_financiamiento=true cuando:\n"
        "- Pregunta aprobacion o viabilidad PERSONALIZADA (ej. 'me aprueban si tengo mal buro?', "
        "'puedo financiar con comprobante informal?', 'califico con mi ingreso?').\n"
        "- Pide COTIZACION o CALCULO personalizado de enganche, mensualidad o pago mensual "
        "(ej. 'cuanto seria de enganche y mensualidad', 'cuanto pagaria al mes', "
        "'cuanto quedaria la mensualidad', "
        "'cotizar enganche y mensualidad', 'cotizame el credito'). "
        "NO aplica si solo dice 'cotizar'/'cotizacion' de un modelo o vehiculo sin terminos de credito. "
        "NO aplica si solo pregunta el enganche en general (sin mensualidad/pago mensual ni datos de SU caso); "
        "eso lo responde el bot con el mensaje publicado de enganche.\n"
        "- Pide un PLAN o CREDITO con PLAZO concreto (N meses/anios) para SU compra, aunque diga "
        "'plan de financiamiento' o similar. El bot no arma plazos a la medida; eso lo hace un asesor "
        "(ej. 'quiero un plan de financiamiento a 24 meses', 'necesito a 36 meses', "
        "'armame el credito a 48 meses', 'puedo pagarlo en 18 meses?', 'financiar a 12 meses').\n"
        "- Pide excepciones, negociacion o condiciones especiales no listadas (menor enganche, "
        "refinanciar, penalizaciones en SU caso, plazos custom).\n"
        "- Solicita informacion MAS DETALLADA sobre credito/planes que va mas alla de listar, "
        "comparar o leer datos publicados (tasa/enganche/plazo del catalogo).\n"
        "- Pregunta DETALLES del proceso o criterios de revision del buro de credito "
        "(ej. 'que detalles revisan del buro?', 'que puntos evaluan?', 'como revisan mi historial?').\n"
        "- Profundiza en buró/credito tras una respuesta FAQ generica del bot "
        "(mas informacion, explicame el proceso, que revisan exactamente).\n"
        "- Acepta o pide continuar cuando el bot ofrecio explicar el proceso de buró/credito "
        "(ej. 'si por favor', 'si', 'adelante', 'cuentame mas' tras esa oferta).\n"
        "- Acepta o pide continuar cuando el bot respondio FAQ de requisitos/documentos para credito "
        "y ofrecio mas detalle o contacto con asesor "
        '(ej. "si", "claro", "adelante" tras "¿te gustaria que un asesor te contacte?" '
        'o "¿quieres mas detalle sobre requisitos de credito?").\n'
        "- Pregunta como funciona el proceso de aprobacion paso a paso para SU situacion.\n"
        "requiere_asesor_financiamiento=false cuando:\n"
        "- Pregunta el PRECIO o COSTO del vehiculo "
        "(ej. 'cuanto cuesta', 'que precio tiene', 'con que porcion cuesta este vehiculo', "
        "'en cuanto sale', 'cual es el costo'). El precio es dato publicado del catalogo; "
        "NO es cotizacion personalizada de credito.\n"
        "- Pregunta por el ENGANCHE de forma GENERAL (ej. 'cuanto es el enganche', 'piden enganche?', "
        "'cuanto de enganche', 'como funciona el enganche') sin pedir calculo para SU caso "
        "ni combinarlo con mensualidad/pago mensual. El bot responde con el mensaje publicado de enganche.\n"
        "- Quiere ver, listar, comparar o ELEGIR planes YA PUBLICADOS del catalogo "
        "(sin exigir un plazo concreto a la medida).\n"
        "- Pregunta tasa o plazos GENERICO de lo publicado "
        "(ej. 'cuales son las tasas', 'que plazos manejan', 'planes de financiamiento', "
        "'que planes tienen', 'opciones de credito') sin pedir 'a N meses' para su caso.\n"
        "- Pregunta enganche o mensualidad de un plan PUBLICADO ya nombrado o seleccionado "
        "en el catalogo, sin pedir cotizacion para su caso.\n"
        "- Pregunta FAQ de negocio BASICA y general sobre buro: solo si revisan o no, "
        "sin pedir detalles del proceso ni profundizar (ej. 'revisan buro de credito?').\n"
        "- Otras FAQs de negocio simples: papeles para comprar, politicas del lote, "
        "metodos de pago en caja, atrasos como politica general (no su caso personal).\n"
        "- Responde al turno del bot con seleccion comercial EXPLICITa: numero de lista, nombre de plan "
        "o referencia directa a un plan mostrado (NO basta un 'si'/'claro' aislado).\n"
        "- Responde 'si'/'claro'/'ok' SOLO cuando mensaje_previo_bot pidio elegir plan de lista numerada "
        "reciente (con renglones 1., 2., etc.) y el usuario confirma uno de esos planes.\n"
        "- Pide ver otros autos, promociones o detalles del vehiculo sin duda personalizada de credito.\n"
        "- Interes en un plan YA mostrado + pide mas informacion del vehiculo/auto (NO es cotizacion de credito) "
        "(ej. 'si me interesa el plan pero quiero mas informacion del vehiculo', "
        "'me interesa el plan, dame detalles del carro', "
        "'si quiero el plan pero primero info del vehiculo').\n"
        "- Pide COTIZAR un vehiculo/modelo sin mencionar credito, enganche, mensualidad, plazo o financiamiento "
        "(ej. 'quiero cotizar el Swift', 'cotizar el Jimny', 'me cotizas el Dzire', 'cotizacion del Vitara'). "
        "Eso es interes de catalogo/vehiculo, no cotizacion personalizada de credito.\n"
        "- Esta en flujo de PROMOCIONES: quiere aplicar, seleccionar o confirmar una promocion/bono/descuento "
        "sin preguntar credito personalizado "
        "(ej. 'quiero aplicar la promocion', 'aplico la promocion', 'confirmo esa promocion', "
        "'si quiero aplicarla', 'esa promocion me interesa').\n"
        "- Combina aplicar/confirmar promocion + preguntar si HAY planes/opciones PUBLICADAS de financiamiento "
        "(ej. 'aplico la promocion, hay plan de financiamiento?', "
        "'aplico la promocion, tienen planes de credito?', "
        "'si aplico esa promo, que planes de financiamiento tienen?'). "
        "Eso es navegacion comercial + catalogo, no cotizacion personalizada.\n"
        "- nodo_actual es promotions y mensaje_usuario trata de promociones comerciales, no de financiamiento "
        "personalizado ni buro.\n"
        "Prioridad en empate:\n"
        "- Si mensaje_usuario pide un PLAZO concreto (N meses/anios) o 'a N meses' para financiar SU compra "
        "→ usa true aunque diga 'plan de financiamiento' o 'quiero un plan'. "
        "Eso NO es solo listar el catalogo.\n"
        "- Si mensaje_usuario solo pide ver/listar/conocer planes u opciones publicadas "
        "(ej. 'planes de financiamiento', 'que planes tienen', 'opciones de credito', 'cuales son las tasas', "
        "'hay plan de financiamiento?') "
        "SIN plazo concreto ni cotizacion personalizada → usa false.\n"
        "- Si nodo_actual es promotions y mensaje_usuario aplica/elige promocion y/o pregunta por planes "
        "publicados (sin 'a N meses' ni cotizacion personalizada) → usa false.\n"
        "- Si mensaje_usuario combina interes en plan listado + informacion del vehiculo "
        "(sin cotizacion personalizada de enganche/mensualidad) → usa false.\n"
        "- Si nodo_actual es promotions y mensaje_usuario pide aplicar/elegir/confirmar promocion "
        "→ usa false aunque mencione compra o vehiculo.\n"
        "- Si mensaje_usuario es afirmacion corta ('si', 'claro', 'ok', 'adelante') y mensaje_previo_bot "
        "habla de requisitos de credito, documentos, buró o ofrece asesor → usa true.\n"
        "- Si mensaje_previo_bot NO tiene lista numerada de planes y el usuario no nombra plan → usa true "
        "solo cuando la intencion es profundizar en credito personalizado; no trates 'si' como elegir plan.\n"
        "En duda: true si pide plazo concreto, cotizacion o condiciones a la medida; "
        "false solo si claramente pide info publicada del catalogo, aplica promocion, "
        "pide detalle del vehiculo o elige un plan ya listado.\n\n"
        f"nodo_actual: {node}\n"
        f"vehiculo_actual: {vehicle}\n"
        f"plan_actual: {plan}\n"
        f"mensaje_previo_bot: {previous}\n"
        f"mensaje_usuario: {current}\n"
        "Lista numerada reciente de planes (si aplica):\n"
        f"{numbered}\n"
    )


def build_financing_plan_comparison_extract_prompt(
    *,
    previous_bot_message: str,
    user_message: str,
    numbered_plan_lines: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Extrae indices o nombres de dos planes a comparar."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    lines = numbered_plan_lines.strip() or "(sin lista numerada)"
    return (
        f"{system_prompt}\n\n"
        "EXTRACTOR_COMPARACION_PLANES:\n"
        "Responde SOLO con JSON de una linea:\n"
        '{ "wants_compare": <bool>, "index_left": <number|null>, "index_right": <number|null>, '
        '"name_left": <string>, "name_right": <string> }\n'
        "Reglas:\n"
        "- wants_compare=true si el usuario quiere comparar dos planes listados o contrastar dos opciones de credito "
        "(diferencias, en que se diferencian, cual es mejor, vs, o typos como 'difetencian').\n"
        "- index_left/index_right: numeros 1-based segun la lista numerada; null si usa nombres.\n"
        "- name_left/name_right: fragmento corto del nombre de cada plan tal como lo dijo el usuario "
        "(debe alinearse con los textos en 'Planes listados', sin inventar nombres); vacio si usa indices.\n"
        "- Si el mensaje solo elige UN plan sin pedir comparacion, wants_compare=false.\n"
        "- Si no es comparacion, wants_compare=false y null/ vacios.\n\n"
        f"Planes listados:\n{lines}\n\n"
        f"Mensaje previo del bot: {previous}\n"
        f"Mensaje del usuario: {current}\n"
    )


def build_promotion_comparison_extract_prompt(
    *,
    previous_bot_message: str,
    user_message: str,
    numbered_promotion_lines: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Extrae indices o titulos de dos promociones a comparar."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    lines = numbered_promotion_lines.strip() or "(sin lista numerada)"
    return (
        f"{system_prompt}\n\n"
        "EXTRACTOR_COMPARACION_PROMOCIONES:\n"
        "Responde SOLO con JSON de una linea:\n"
        '{ "wants_compare": <bool>, "index_left": <number|null>, "index_right": <number|null>, '
        '"title_left": <string>, "title_right": <string> }\n'
        "Reglas analogas a planes: indices 1-based o titulos parciales; vacio si no aplica.\n\n"
        f"Promociones listadas:\n{lines}\n\n"
        f"Mensaje previo del bot: {previous}\n"
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
        "Estas en el paso de agenda (el bot va a compartir o acaba de compartir un enlace para agendar prueba de manejo o visita).\n"
        "Clasifica SOLO si el usuario quiere cambiar de tema en este turno.\n"
        "Responde SOLO con una etiqueta exacta:\n"
        "- STAY: continuar en agenda o interes en el vehiculo actual (confirmaciones, dudas sobre el link, gracias, etc.).\n"
        "- PROMOTIONS: pide promociones/ofertas/descuentos/bonos.\n"
        "- FINANCING: pide planes/tasas/plazos/credito/enganche.\n"
        "- CAR_SELECTION: pide ver otros modelos/vehiculos/catalogo distintos al actual.\n"
        "Reglas criticas:\n"
        "- Si el usuario expresa interes en el vehiculo actual (ej. 'me interesa', 'si quiero este') => STAY.\n"
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
        '  "quiere_asesor_humano": <bool>,\n'
        '  "tema_vehiculo_inventario": <bool>,\n'
        '  "tema_financiamiento_credi": <bool>,\n'
        '  "es_respuesta_o_seguimiento_al_ultimo_bot": <bool>\n'
        "}\n\n"
        "quiere_asesor_humano: true SOLO cuando el user pide EXPLICITAMENTE hablar con una persona real, un asesor humano, "
        "ejecutivo, operador, vendedor humano, que lo comuniquen con alguien del equipo o atencion humana "
        "(ej. 'quiero hablar con un asesor', 'pasame con una persona', 'necesito un humano'). "
        "No basta con FAQ de horario/ubicacion sin pedir humano.\n"
        "quiere_asesor_humano: false cuando:\n"
        "- solo pregunta datos del negocio (horario, direccion) sin pedir contacto humano explicito;\n"
        "- el mensaje es una presentacion o respuesta corta con nombre propio "
        "(ej. 'Con Javier', 'soy Maria', 'me llamo Luis', 'Javier', 'hola soy Ana'); "
        "la preposicion 'con' + nombre NO significa pedir un asesor;\n"
        "- es respuesta corta o seguimiento al ultimo bot (si/no, ok, un dato pedido) sin pedir humano;\n"
        "- el bot pregunto WhatsApp/llamada/cita y el user elige canal "
        "(ej. 'whatsapp', 'llamada', 'cita', 'marquenme', 'me marquen', 'llamame', 'por aqui').\n"
        "Ejemplos quiere_asesor_humano=false (NO escalar):\n"
        "- Bot: '¿En qué te puedo ayudar?' User: 'Con Javier'\n"
        "- Bot: 'Cuentame que buscas' User: 'soy Maria'\n"
        "Ejemplos quiere_asesor_humano=true:\n"
        "- 'quiero hablar con un asesor'\n"
        "- 'pasame con una persona real'\n"
        "Definicion de interrumpir_por_faq (true = debe atenderse con FAQ de negocio, no con catalogo/planes):\n"
        "- true: pregunta por el negocio, agencia o lote: ubicacion, horarios, garantia o politica del lote, "
        "contacto de oficina, datos generales de la concesionaria, que metodos de pago aceptan en caja, "
        "politica por atraso de pagos, papeles/documentos para comprar, adeudos o multas del vehiculo, "
        "consultas sobre buró o historial crediticio como requisito del negocio, "
        "si venden seminuevos/usados o solo nuevos (politica de inventario del lote), "
        "disponibilidad y condiciones de prueba de manejo, etc.\n"
        "- false: todo lo demas, incluido: preguntas sobre un coche, modelo, anio, estado, 'como es' un auto, "
        "comparaciones de unidades, mas fotos, si/no, respuestas cortas al turno, seleccion de plan concreto, "
        "enganche/plazos/mensualidad al elegir coche o plan, "
        "cualquier cosa de inventario, catalogo o cierre de paso (confirmacion de compra, datos, etc.)\n"
        "Ejemplos que DEBEN marcarse como FAQ (interrumpir_por_faq=true):\n"
        "- 'que pasa si me atraso en el pago?'\n"
        "- 'que papeles necesito para comprarlo?'\n"
        "- 'el auto tiene adeudos o multas?'\n"
        "- 'revisan buro de credito?'\n"
        "- 'tienen prueba de manejo?'\n"
        "- 'tienen seminuevos?'\n"
        "- 'manejan autos usados?'\n"
        "Ejemplos que NO deben marcarse como FAQ (interrumpir_por_faq=false):\n"
        "- 'quiero ver mas fotos'\n"
        "- 'me interesa el plan 2'\n"
        f"Contexto: esperando_confirmacion_compra={espera_conf} | candidatos_vehiculo_listos_para_elegir={cands}.\n"
        "tema_vehiculo_inventario: el mensaje trata de autos, unidades, modelos, anios, fotos, detalles, comparar.\n"
        "tema_financiamiento_credi: enganche, plazo, tasa, mensualidad o seleccion de plan en contexto de compra; "
        "false si pregunta politicas del negocio sobre credito/buro/requisitos generales.\n"
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
    """Prompt para responder FAQ con estilo conversacional usando base FAQ de BD."""

    system_prompt = build_system_prompt(bot_settings)
    question = user_question.strip() or "(mensaje vacio)"
    context = faq_context.strip() or "(sin contexto FAQ disponible)"
    return (
        f"{system_prompt}\n\n"
        "RESPUESTA_FAQ:\n"
        "Responde de forma natural y conversacional usando EXCLUSIVAMENTE la BASE_FAQ provista "
        "y, si existe, el bloque PERFIL_NEGOCIO_VERIFICADO en CONTEXTO.\n"
        "Prioriza BASE_FAQ; si no contiene la respuesta, usa solo PERFIL_NEGOCIO_VERIFICADO.\n"
        "Si no hay informacion suficiente y existe mensaje_fallback_faq_literal en MENSAJES_PREDEFINIDOS_VERIFICADOS "
        "(dentro de CONTEXTO), usalo como respuesta.\n"
        "No copies textualmente: reformula la informacion para que suene cercana y clara.\n"
        "Si la BASE_FAQ no contiene informacion suficiente, dilo amablemente y ofrece una alternativa de ayuda.\n"
        "Si el contenido disponible sugiere un siguiente paso (por ejemplo, revisar modelos o planes), "
        "puedes incluirlo de forma breve y util.\n"
        "No inventes datos. No saludes. No menciones que eres una IA.\n\n"
        f"PREGUNTA_USUARIO: {question}\n\n"
        f"BASE_FAQ:\n{context}\n"
    )


def build_vehicle_filter_extraction_prompt(
    user_text: str,
    brands: list[str],
    models: list[str],
    colors: list[str],
) -> str:
    """Prompt extractor JSON de filtros de inventario para búsqueda de vehículos."""

    return (
        "Extrae filtros de búsqueda de vehículos del mensaje del usuario.\n"
        "Responde SOLO un JSON con esta forma exacta:\n"
        '{"brand": null|string, "model": null|string, "color": null|string, "year": null|int, "minPrice": null|int, "maxPrice": null|int}\n'
        "Reglas:\n"
        "- No inventes valores.\n"
        "- Si no hay evidencia clara, usa null.\n"
        "- Precio debe ir en enteros absolutos (sin comas ni símbolos).\n"
        "- Si el usuario da un rango, usa minPrice y maxPrice.\n"
        "- Si solo indica tope/presupuesto máximo, usa maxPrice.\n"
        "- Si solo indica mínimo, usa minPrice.\n"
        "- Distingue año de modelo vs precio.\n"
        "- Usa como referencia estas opciones conocidas para mapear aliases/typos, pero no te limites estrictamente a ellas.\n"
        f"brands_catalog={json.dumps(brands, ensure_ascii=False)}\n"
        f"models_catalog={json.dumps(models, ensure_ascii=False)}\n"
        f"colors_catalog={json.dumps(colors, ensure_ascii=False)}\n"
        f"user_message={json.dumps(str(user_text or ''), ensure_ascii=False)}\n"
    )


def build_vehicle_requirement_match_prompt(user_text: str, catalog_block: str) -> str:
    """Prompt para emparejar requisitos de uso/capacidad/precio contra el catálogo."""

    return (
        "Determina si el usuario pide vehiculos segun un requisito de uso, capacidad, caracteristica "
        "o superlativo de precio que se pueda resolver con el CATALOGO "
        "(ej. plataforma/uber/didi, pasajeros, familiar, carga, ciudad, transmision, "
        "mas barato/economico/accesible, etc.).\n"
        "Responde SOLO un JSON con esta forma exacta:\n"
        '{"is_requirement_search": true|false, "matched_vehicle_ids": ["id"], "criterion_summary": "..."}\n'
        "Reglas:\n"
        "- is_requirement_search=true si el mensaje pide filtrar por uso/capacidad/caracteristica "
        "basada en description o metadata (incluye transmision automatica o manual), "
        "O si pide el vehiculo mas barato/economico/accesible / de menor precio "
        "(superlativo de precio sobre el campo price del CATALOGO).\n"
        "- is_requirement_search=false si pide catalogo general (que carros tienes), "
        "marca/modelo/año/color, un presupuesto o rango numerico de precio "
        "(hasta X, entre X y Y, presupuesto de X), o no hay un requisito interpretable.\n"
        "- matched_vehicle_ids: solo IDs que aparecen en CATALOGO y que cumplen el requisito. "
        "Para uso/capacidad: evidencia en description o metadata. "
        "Para superlativo de precio: el/los vehiculos con el price numerico mas bajo "
        "(ignora price=N/D). Si hay empate, incluye todos los empatados. Si ninguno tiene price, usa [].\n"
        "- No inventes IDs ni datos. Si description/metadata no sostiene el match (salvo precio), no lo incluyas.\n"
        "- criterion_summary: resumen corto del criterio (ej. 'apto para plataforma uber/didi', "
        "'menor precio') o \"\" si is_requirement_search=false.\n"
        "- Para pasajeros u otros valores numericos en metadata, aplica el umbral exacto del usuario "
        "(ej. 5 o mas).\n"
        "Reglas de transmision (revisa los campos transmission y transmissionFull en metadata):\n"
        "- Sinonimos de transmision AUTOMATICA: automatica, automatico, aut, CVT, TA, automatic, "
        "tiptronic, DSG, doble embrague.\n"
        "- Sinonimos de transmision MANUAL: manual, mecanica, estandar, std, TM, de velocidades.\n"
        "- Muchos vehiculos ofrecen AMBAS transmisiones en el mismo texto, separadas por '/', 'y' u 'o' "
        "(ej. 'manual de 5 velocidades / CVT', 'TA 4 vel / TM 5 vel', "
        "'Automatica de 4 velocidades (TA) / Manual de 5 velocidades (TM)').\n"
        "- Si el texto de transmision incluye alguna opcion automatica (aunque tambien mencione manual), "
        "el vehiculo SI cumple un requisito de transmision automatica.\n"
        "- Si incluye alguna opcion manual (aunque tambien mencione automatica), el vehiculo SI cumple "
        "un requisito de transmision manual.\n"
        "Ejemplos de transmision:\n"
        "- usuario pide 'que sea automatico' y transmission='manual de 5 velocidades / CVT' -> SI cumple "
        "(CVT es automatica).\n"
        "- usuario pide 'automatico' y transmission='TA 4 vel / TM 5 vel' -> SI cumple (TA es automatica).\n"
        "- usuario pide 'automatico' y metadata transmissionFull='Automatica de 4 velocidades (TA) / Manual de 5 "
        "velocidades (TM)' -> SI cumple.\n"
        "- usuario pide 'manual' y transmission='Automatica de 6 velocidades' -> NO cumple.\n\n"
        f"CATALOGO:\n{catalog_block.strip() or '(vacio)'}\n\n"
        f"user_message={json.dumps(str(user_text or ''), ensure_ascii=False)}\n"
    )


def _build_answer_first_prompt_by_mode(
    *,
    user_question: str,
    context_blocks: str,
    mode: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt base para respuesta answer-first usando solo contexto verificable."""

    system_prompt = build_system_prompt(bot_settings)
    question = user_question.strip() or "(mensaje vacio)"
    context = context_blocks.strip() or "(sin contexto)"
    mode_label = mode.strip().lower() or "general"
    return (
        f"{system_prompt}\n\n"
        "ANSWER_FIRST_RESPONSE:\n"
        "Tu prioridad es responder la pregunta del usuario con informacion verificable del CONTEXTO.\n"
        "Reglas obligatorias:\n"
        "- Usa EXCLUSIVAMENTE el CONTEXTO provisto.\n"
        "- Si no hay evidencia suficiente, dilo claramente y de forma amable.\n"
        "- No inventes datos tecnicos ni disponibilidad.\n"
        "- Manten tono natural y breve.\n"
        "- Responde la duda del usuario en 1-2 oraciones.\n"
        "- Puedes sugerir una accion comercial/logica SOLO si el CONTEXTO ya la implica "
        "(p. ej. listado de planes que el sistema mostrara aparte).\n"
        "- PROHIBIDO inventar CTA de cita, compra, contacto con asesor o pregunta de cierre comercial; "
        "el sistema agrega cierres literales cuando aplica.\n"
        "- En este modo ignora salesProactivity alto: actua como proactividad baja "
        "(no inventes siguientes pasos ni preguntas para continuar).\n"
        "- El bloque estructurado (listados, opciones, precios, planes, promociones) se mostrara aparte "
        "en otro mensaje del sistema: NO lo repitas ni lo parafrasees.\n"
        "- Evita copiar frases literales del CONTEXTO si describen listados u opciones.\n"
        "- No enumeres modelos/planes/promociones en tu respuesta semantica.\n"
        "- IMPORTANTE: no incluyas encabezados ni etiquetas literales como "
        "'RESPUESTA', 'SIGUIENTE_PASO' o 'CIERRE'.\n"
        "- No saludes salvo que el usuario haya saludado.\n\n"
        f"DOMINIO: {mode_label}\n"
        f"PREGUNTA_USUARIO: {question}\n\n"
        f"CONTEXTO:\n{context}\n"
    )


def build_answer_first_inventory_prompt(
    user_question: str,
    context_blocks: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt answer-first para catalogo/inventario de vehiculos."""

    return _build_answer_first_prompt_by_mode(
        user_question=user_question,
        context_blocks=context_blocks,
        mode="inventory",
        bot_settings=bot_settings,
    )


def build_answer_first_financing_prompt(
    user_question: str,
    context_blocks: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt answer-first para financiamiento."""

    return _build_answer_first_prompt_by_mode(
        user_question=user_question,
        context_blocks=context_blocks,
        mode="financing",
        bot_settings=bot_settings,
    )


def build_answer_first_promotion_prompt(
    user_question: str,
    context_blocks: str,
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt answer-first para promociones."""

    return _build_answer_first_prompt_by_mode(
        user_question=user_question,
        context_blocks=context_blocks,
        mode="promotion",
        bot_settings=bot_settings,
    )


def build_answer_first_faq_prompt(
    user_question: str,
    context_blocks: str,
    bot_settings: dict[str, Any] | None,
    *,
    faq_close_topic: str = "general",
) -> str:
    """Prompt answer-first para FAQ de negocio."""

    prompt = _build_answer_first_prompt_by_mode(
        user_question=user_question,
        context_blocks=context_blocks,
        mode="faq",
        bot_settings=bot_settings,
    )
    topic = str(faq_close_topic or "").strip().lower()
    if topic == "horarios":
        return (
            f"{prompt}\n"
            "Regla adicional para FAQ de horarios:\n"
            "- Responde SOLO con la informacion de horario o dias de atencion.\n"
            "- NO sugieras revisar modelos, comprar ni ver un carro.\n"
            "- NO incluyas pregunta de cierre comercial; el sistema puede o no agregar un cierre "
            "literal segun el contexto del flujo.\n"
        )
    if topic == "ubicacion":
        return (
            f"{prompt}\n"
            "Reglas adicionales para FAQ de ubicacion:\n"
            "- El CONTEXTO puede incluir varias direcciones (agencia/showroom de ventas vs taller o area de servicio/refacciones).\n"
            "- Lee TODAS las entradas del CONTEXTO antes de responder.\n"
            "- Si el usuario pregunta de forma general (donde estan, direccion, ubicacion, sucursal) "
            "SIN mencionar servicio, taller, refacciones ni mantenimiento: responde con la direccion de la "
            "AGENCIA o showroom principal de ventas, NO la del taller o servicio temporal.\n"
            "- Si el usuario menciona servicio, taller, refacciones, mantenimiento o area de servicio: "
            "responde con la direccion del TALLER o area de servicio que corresponda en el CONTEXTO.\n"
            "- Si el usuario no especifica y en el CONTEXTO hay agencia y taller con direcciones distintas, "
            "puedes mencionar ambas en una o dos oraciones cortas, dejando claro cual es ventas y cual es servicio.\n"
            "- Usa EXCLUSIVAMENTE direcciones del CONTEXTO; no inventes ni mezcles datos de distintas entradas.\n"
            "- NO sugieras revisar modelos, comprar ni ver un carro.\n"
            "- NO incluyas pregunta de cierre comercial; el sistema puede o no agregar un cierre "
            "literal segun el contexto del flujo.\n"
        )
    return prompt
