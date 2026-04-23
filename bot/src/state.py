"""Definiciones de estado para el bot asesor de carros.

Este archivo centraliza el contrato de datos que viaja entre nodos del grafo.
"""

from typing import Any, TypedDict


class clientState(TypedDict, total=False):
    """Estado global de conversación manejado por LangGraph.

    Campos obligatorios del MVP:
    - messages: historial de mensajes (usuario y asistente).
    - current_node: estado lógico actual del flujo.
    - selected_brand: marca elegida por el usuario.
    - selected_car: vehículo seleccionado por el usuario.
    - selected_vehicle_id: id del vehiculo seleccionado para consultas detalladas.
    - customer_info: datos del lead capturados durante la conversación.

    Campos de apoyo para frontend/API:
    - last_bot_message: último texto generado para mostrar al usuario.
    - options: botones/opciones disponibles para renderizar.

    Banderas de control para ejecucion multi-nodo en un mismo invoke:
    - skip_brand_prompt / skip_car_prompt / skip_lead_prompt.
    - resume_to_step: paso de retorno despues de FAQ interruptiva.
    - is_faq_interrupt: indica si FAQ interrumpio el flujo principal.
    - awaiting_purchase_confirmation: espera una respuesta si/no tras mostrar detalle.
    - last_vehicle_candidates: candidatos previos para desambiguar seleccion.
    """

    messages: list[dict[str, Any]]
    current_node: str
    intent: str
    selected_brand: str
    selected_car: str
    selected_vehicle_id: str
    customer_info: dict[str, Any]
    last_vehicle_candidates: list[dict[str, Any]]
    last_bot_message: str
    options: list[str]
    skip_brand_prompt: bool
    skip_car_prompt: bool
    skip_lead_prompt: bool
    resume_to_step: str
    is_faq_interrupt: bool
    awaiting_purchase_confirmation: bool
