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
        f"- Tus respuestan deben ser naturales y humanas, no robotizadas."
    ]
    if custom_instructions:
        parts.append(f"- Instrucciones personalizadas del negocio: {custom_instructions}")
    return "\n".join(parts)


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
    return (
        f"{system_prompt}\n\n"
        "RESPUESTA_CONVERSACIONAL_OTRO:\n"
        "Eres CarAdvisor. Responde de forma natural y contextual al ultimo mensaje del usuario.\n"
        "A continuacion aparece DATOS_VERIFICADOS: solo configuracion/estilo del bot y mensaje del usuario. "
        "No inventes inventario, precios, promociones, planes de financiamiento ni disponibilidad de vehiculos.\n"
        "Reglas:\n"
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
        "Si DATOS_VERIFICADOS contiene un listado de vehiculos, COPIALO TAL CUAL en tu respuesta en una seccion clara "
        "(mismas lineas y datos); puedes agregar antes o despues una frase breve de contexto sin contradecir el listado.\n"
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
        "Cierra invitando a elegir un modelo o a pedir ayuda para comparar.\n"
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
    "purchase_question": (
        "TAREA: Pregunta de cierre para saber si le interesa una prueba de manejo o ver el vehiculo en persona "
        "(y ver mas imagenes del mismo si DATOS_VERIFICADOS lo indica).\n"
        "DATOS_VERIFICADOS incluye instrucciones literales del sistema (si incluye opcion de imagenes o no).\n"
        "Genera una sola pregunta breve tipo si/no de interes, alineada a esas reglas; puedes usar 1-2 emojis si el bloque lo permite.\n"
        "PROHIBIDO: fechas, horas, dias, lugar, disponibilidad de agenda, preguntar cuando prefiere venir, "
        "prometer que tu agendarias o confirmarias la cita. Solo mide interes; el equipo dara seguimiento despues.\n"
        "No inventes equipamiento. Espanol (Mexico). Sin prefijos."
    ),
    "faq_insufficient": (
        "TAREA: Indicar que no hay suficiente informacion en la base FAQ para responder con precision.\n"
        "Usa solo DATOS_VERIFICADOS. Ofrece ayuda general (catalogo, planes, contacto) sin inventar datos del negocio.\n"
        "Breve. Espanol (Mexico)."
    ),
    "faq_resume_transition": (
        "TAREA: Generar UNA sola pregunta breve de reanudacion del flujo comercial interrumpido.\n"
        "DATOS_VERIFICADOS incluye paso_a_reanudar, contexto_del_paso, estado_flujo, ultimo_mensaje_bot y mensaje_usuario_faq.\n"
        "La pregunta debe retomar lo que el bot estaba pidiendo en ultimo_mensaje_bot y el estado_flujo, no un guion generico.\n"
        "Si vehiculo_seleccionado no es (ninguno): PROHIBIDO preguntar si quiere ver catalogo, modelos disponibles, marcas "
        "o si tiene vehiculo en mente; retoma el paso concreto (confirmacion de interes, detalle, imagenes, etc.).\n"
        "Si plan_financiamiento_seleccionado no es (ninguno): no pidas elegir plan desde cero; continua con ese plan.\n"
        "Si promocion_seleccionada no es (ninguno): no pidas elegir promocion desde cero; continua con esa promocion.\n"
        "No repitas ni respondas la duda FAQ del usuario (eso va en otro mensaje).\n"
        "No inventes datos del negocio, horarios, direcciones ni politicas.\n"
        "PROHIBIDO: agendar citas con fecha, hora, dia o lugar; prometer que coordinaras agenda.\n"
        "Puedes usar un conector minimo (ej. Perfecto, Claro) antes de la pregunta.\n"
        "Maximo 1-2 oraciones. Debe terminar en pregunta. Espanol (Mexico). Sin prefijos."
    ),
    "faq_turn": (
        "TAREA: Responder la duda del usuario usando EXCLUSIVAMENTE el texto en BASE_FAQ_DESDE_BD dentro de DATOS_VERIFICADOS.\n"
        "No inventes horarios, direcciones, politicas ni datos que no aparezcan en BASE_FAQ_DESDE_BD.\n"
        "Si faq_respuesta_compacta es true, limita la parte de la respuesta FAQ a un solo parrafo corto (idea principal).\n"
        "Despues de la respuesta FAQ, si transicion_literal no es '(ninguna)', integra esa pregunta de transicion "
        "de forma natural (conectores y mayusculas; conserva el sentido de la pregunta).\n"
        "Al final, si cierre_literal no es '(ninguno)', incluye esa pregunta o cierre de forma natural.\n"
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
        "- No menciones precio, costo ni valor del vehiculo a menos que DATOS_VERIFICADOS incluya la linea Precio.\n"
        "- No menciones color, tonalidad ni pintura del vehiculo a menos que DATOS_VERIFICADOS incluya la linea Color.\n"
        "- Incluye de forma natural todos los campos que aparezcan en DATOS_VERIFICADOS (marca, modelo, año, kilometraje, "
        "transmision, motor y descripcion). Si algun valor es N/D o indica que no hay descripcion, dilo con naturalidad sin inventar detalles.\n"
        "- No uses listas con viñetas ni formato 'Etiqueta: valor' en lineas separadas; integra todo en parrafos o frases enlazadas.\n"
        "- Evita markdown de tablas o listas; maximo un salto de linea entre dos parrafos cortos si ayuda a la lectura.\n"
        "- No agregues cierre invitando a pedir mas informacion, ver otros modelos, seguir explorando el catalogo\n"
        "- Termina el texto al describir el vehiculo segun DATOS_VERIFICADOS, sin preguntas ni ofertas de catalogo adicional.\n"
        "- Devuelve UNICAMENTE el mensaje para el usuario, sin titulos, sin prefijos tipo 'Respuesta:' ni comillas."
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
        "- No menciones precio, costo ni valor salvo que ambas fichas en DATOS_VERIFICADOS incluyan la linea Precio.\n"
        "- No menciones color, tonalidad ni pintura salvo que ambas fichas en DATOS_VERIFICADOS incluyan la linea Color.\n"
        "- Contrasta de forma natural lo que difiere (kilometraje, motor, año, descripcion, estado) sin inventar similitudes no respaldadas.\n"
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
        "- Usa EXCLUSIVAMENTE informacion que aparezca en DATOS_VERIFICADOS (mismos valores: kilometraje, motor, etc.). "
        "No inventes equipamiento, garantias, historial, consumo, revisiones, financiamiento ni promociones.\n"
        "- Si preguntan por precio, costo o valor, respondelo solo si DATOS_VERIFICADOS incluye la linea Precio; "
        "si no esta en el bloque, dilo con naturalidad y sugiere que el equipo pueda confirmarlo.\n"
        "- Si preguntan por color, tonalidad o pintura, respondelo solo si DATOS_VERIFICADOS incluye la linea Color; "
        "si no esta en el bloque, dilo con naturalidad y sugiere que el equipo pueda confirmarlo.\n"
        "- Si el dato no esta en DATOS_VERIFICADOS o figura como N/D, dilo con naturalidad y sugiere que el equipo pueda confirmarlo.\n"
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
        "(ej. 'si', 'quiero una prueba de manejo', 'me interesa verlo en persona'; tolera typos como 'prubea' o 'maneja').\n"
        "- NO: el usuario rechaza compra.\n"
        "- VER_MODELO: el usuario quiere seguir viendo opciones, otros modelos, o cambiar de vehiculo (incluye preguntas "
        "centradas en otro modelo distinto al que se esta mostrando).\n"
        "- VER_MAS_IMAGENES: el usuario pide ver mas fotos/imagenes del vehiculo actual.\n"
        "- PREGUNTA_MODELO: el usuario pregunta datos del vehiculo que ya esta en contexto (precio, kilometraje, motor, "
        "transmision, color, descripcion, año, etc.) sin confirmar ni rechazar compra, similar a una mini-FAQ anclada al inventario. "
        "No uses PREGUNTA_MODELO si claramente pide otro carro distinto (eso es VER_MODELO).\n"
        "- UNKNOWN: no encaja en ninguna categoria anterior o es ambiguo.\n"
        "Responde SOLO con una de estas etiquetas exactas: SI, NO, VER_MODELO, VER_MAS_IMAGENES, PREGUNTA_MODELO, UNKNOWN.\n\n"
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
        "- HUMAN_ADVISOR: quiere hablar con un asesor humano, persona real, ejecutivo o que lo comuniquen con alguien del equipo.\n"
        "- FAQ: pregunta informacion general del negocio (ubicacion, horarios, garantias) sin pedir hablar con un humano.\n"
        "- OTHER: saludo, agradecimiento o mensaje fuera del alcance.\n"
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
        "- ask_financing=false si pide prueba de manejo, agendar prueba o ver/visitar el vehiculo en persona "
        "(incluye 'quiero una prueba', 'agendar prueba', typos como 'prubea'). En esos casos usa confirm_purchase=true.\n"
        "- ask_images=true cuando pide ver fotos/imagenes del vehiculo actual por primera vez (muestrame fotos, quiero ver imagenes, "
        "tienen fotos del auto). No uses ask_images si solo habla de ver el vehiculo en persona o agendar prueba de manejo.\n"
        "- ask_more_images=true cuando pide mas fotos/imagenes del vehiculo actual despues de un envio previo (mas fotos, siguientes imagenes).\n"
        "- Si es claramente primer pedido de fotos, ask_images=true y ask_more_images=false.\n"
        "- wants_other_vehicles=true cuando quiere ver otro modelo/u otro carro/catalogo sin pedir comparacion explícita.\n"
        "- wants_other_vehicles=false si solo pide datos/ficha/informacion/especificaciones/caracteristicas del modelo o vehiculo "
        "ya mostrado (ej. 'dame los datos del modelo', 'muestrame la ficha') sin pedir otro carro ni el catalogo.\n"
        "- confirm_purchase=true cuando confirma avanzar, comprar el vehiculo actual, o pide/agenda prueba de manejo o "
        "ver/visitar el vehiculo en persona (incluye typos leves: prueba/prubea, manejo/maneja).\n"
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
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt clasificador por flags para navegacion dentro del nodo promotions."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    promotion = current_promotion_title.strip() or "(sin promocion seleccionada)"
    numbered = numbered_promotion_lines.strip() or "(sin lista numerada reciente)"
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
        "usa ask_promotions=true y deja select_promotion=false y apply_promotion=false.\n\n"
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
    bot_settings: dict[str, Any] | None,
) -> str:
    """Prompt clasificador por flags para navegacion en seleccion de plan de financing."""

    system_prompt = build_system_prompt(bot_settings)
    previous = previous_bot_message.strip() or "(sin mensaje previo)"
    current = user_message.strip() or "(mensaje vacio)"
    vehicle = selected_vehicle_name.strip() or "(sin vehiculo seleccionado)"
    return (
        f"{system_prompt}\n\n"
        "CLASIFICADOR_FLAGS_FINANCING_STEP:\n"
        "Responde SOLO con JSON de una linea con estas claves booleanas exactas:\n"
        '{ "reject_financing_keep_purchase": <bool>, "ask_explicit_plan": <bool>, "wants_compare_two_plans": <bool> }\n'
        "Contexto de negocio:\n"
        "- Estamos en el nodo financing, esperando seleccion explicita de un plan.\n"
        "- Si el usuario rechaza los planes pero mantiene intencion de compra del vehiculo actual, "
        "entonces reject_financing_keep_purchase=true.\n"
        "- Si el usuario sigue ambiguo o no confirma compra sin plan, ask_explicit_plan=true.\n"
        "- wants_compare_two_plans=true cuando pide comparar dos planes de financiamiento (compara plan 1 y 2, diferencias entre planes, vs, "
        "cual conviene mas, en que se diferencian X y Y, ventajas de un plan sobre otro).\n"
        "- wants_compare_two_plans=true si en un solo mensaje nombra o alude claramente a DOS planes distintos para contrastarlos "
        "(ej. menciona dos nombres o apodos de plan distintos, o 'diferencias entre el plan de la fila 1 y el de la fila 3'). "
        "En ese caso NO es seleccion de un solo plan: quiere comparacion.\n"
        "Reglas criticas:\n"
        "- reject_financing_keep_purchase=true cuando haya rechazo claro de planes "
        "(ej. no me interesa ninguno, sin financiamiento, no quiero plan) y al mismo tiempo intencion de compra "
        "del carro actual (ej. solo quiero comprar el carro, si quiero ese carro).\n"
        "- Si no hay evidencia de ambas cosas a la vez, usa reject_financing_keep_purchase=false.\n"
        "- ask_explicit_plan=false solo cuando reject_financing_keep_purchase=true.\n"
        "- Si wants_compare_two_plans=true, pon ask_explicit_plan=false salvo que tambien sea ambiguo sin numeros.\n\n"
        f"awaiting_plan_selection: {str(awaiting_plan_selection).lower()}\n"
        f"has_selected_vehicle: {str(has_selected_vehicle).lower()}\n"
        f"has_selected_promotion: {str(has_selected_promotion).lower()}\n"
        f"vehiculo_actual: {vehicle}\n"
        f"mensaje_previo_bot: {previous}\n"
        f"mensaje_usuario: {current}\n"
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
        "quiere_asesor_humano: true cuando el user pide hablar con una persona real, un asesor humano, ejecutivo, "
        "operador, que lo comuniquen con alguien del equipo o atencion humana (no basta con FAQ de horario/ubicacion sin pedir humano).\n"
        "quiere_asesor_humano: false si solo pregunta datos del negocio (horario, direccion) sin pedir contacto humano explicito.\n"
        "Definicion de interrumpir_por_faq (true = debe atenderse con FAQ de negocio, no con catalogo/planes):\n"
        "- true: pregunta por el negocio, agencia o lote: ubicacion, horarios, garantia o politica del lote, "
        "contacto de oficina, datos generales de la concesionaria, que metodos de pago aceptan en caja, "
        "politica por atraso de pagos, papeles/documentos para comprar, adeudos o multas del vehiculo, "
        "disponibilidad y condiciones de prueba de manejo, etc.\n"
        "- false: todo lo demas, incluido: preguntas sobre un coche, modelo, anio, estado, 'como es' un auto, "
        "comparaciones de unidades, mas fotos, si/no, respuestas cortas al turno, credito/enganche/plazos concretos al elegir coche, "
        "cualquier cosa de inventario, catalogo o cierre de paso (confirmacion de compra, datos, etc.)\n"
        "Ejemplos que DEBEN marcarse como FAQ (interrumpir_por_faq=true):\n"
        "- 'que pasa si me atraso en el pago?'\n"
        "- 'que papeles necesito para comprarlo?'\n"
        "- 'el auto tiene adeudos o multas?'\n"
        "- 'tienen prueba de manejo?'\n"
        "Ejemplos que NO deben marcarse como FAQ (interrumpir_por_faq=false):\n"
        "- 'quiero ver mas fotos'\n"
        "- 'me interesa el plan 2'\n"
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
    """Prompt para responder FAQ con estilo conversacional usando base FAQ de BD."""

    system_prompt = build_system_prompt(bot_settings)
    question = user_question.strip() or "(mensaje vacio)"
    context = faq_context.strip() or "(sin contexto FAQ disponible)"
    return (
        f"{system_prompt}\n\n"
        "RESPUESTA_FAQ:\n"
        "Responde de forma natural y conversacional usando EXCLUSIVAMENTE la BASE_FAQ provista.\n"
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
        "- Estructura de salida obligatoria en 3 partes, en este orden:\n"
        "  1) responde la duda del usuario.\n"
        "  2) sugiere la accion comercial/logica segun el dominio.\n"
        "  3) cierra con una pregunta corta para continuar.\n"
        "- El bloque estructurado (listados, opciones, precios, planes, promociones) se mostrara aparte "
        "en otro mensaje del sistema: NO lo repitas ni lo parafrasees.\n"
        "- Evita copiar frases literales del CONTEXTO si describen listados u opciones.\n"
        "- No enumeres modelos/planes/promociones en tu respuesta semantica.\n"
        "- La parte 1 (respuesta principal) debe ser breve: maximo 1-2 oraciones.\n"
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
) -> str:
    """Prompt answer-first para FAQ de negocio."""

    return _build_answer_first_prompt_by_mode(
        user_question=user_question,
        context_blocks=context_blocks,
        mode="faq",
        bot_settings=bot_settings,
    )
