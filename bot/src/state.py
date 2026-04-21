"""Definiciones de estado para el bot asesor de carros.

Este archivo centraliza el contrato de datos que viaja entre nodos del grafo.
"""

from typing import Any, TypedDict


class clientState(TypedDict, total=False):
    """Estado global de conversación manejado por LangGraph.

    Campos obligatorios del MVP:
    - messages: historial de mensajes (usuario y asistente).
    - current_node: estado lógico actual del flujo.
    - selected_category: categoría elegida por el usuario.
    - selected_car: vehículo seleccionado por el usuario.
    - customer_info: datos del lead capturados durante la conversación.

    Campos de apoyo para frontend/API:
    - last_bot_message: último texto generado para mostrar al usuario.
    - options: botones/opciones disponibles para renderizar.

    Banderas de control para ejecucion multi-nodo en un mismo invoke:
    - skip_category_prompt / skip_car_prompt / skip_lead_prompt.
    - resume_to_step: paso de retorno despues de FAQ interruptiva.
    - is_faq_interrupt: indica si FAQ interrumpio el flujo principal.
    """

    messages: list[dict[str, Any]]
    current_node: str
    selected_category: str
    selected_car: str
    customer_info: dict[str, Any]
    last_bot_message: str
    options: list[str]
    skip_category_prompt: bool
    skip_car_prompt: bool
    skip_lead_prompt: bool
    resume_to_step: str
    is_faq_interrupt: bool
