"""Definiciones de estado para el bot asesor de carros.

Este archivo centraliza el contrato de datos que viaja entre nodos del grafo.
"""

from typing import Any, TypedDict


class clientState(TypedDict, total=False):
    """Estado global de conversación manejado por LangGraph.

    Campos obligatorios del MVP:
    - messages: historial de mensajes (usuario y asistente).
    - current_node: estado lógico actual del flujo.
    - selected_car: vehículo seleccionado por el usuario.
    - selected_vehicle_id: id del vehiculo seleccionado para consultas detalladas.
    - customer_info: datos del lead capturados durante la conversación.

    Campos de apoyo para frontend/API:
    - last_bot_message: último texto generado para mostrar al usuario.

    Banderas de control para ejecucion multi-nodo en un mismo invoke:
    - skip_car_prompt / skip_lead_prompt.
    - resume_to_step: paso de retorno despues de FAQ interruptiva.
    - is_faq_interrupt: indica si FAQ interrumpio el flujo principal.
    - awaiting_purchase_confirmation: espera una respuesta si/no tras mostrar detalle.
    - last_vehicle_candidates: candidatos previos para desambiguar seleccion.
    - vehicle_images_cursor: cursor para paginacion de imagenes del vehiculo seleccionado.
    - vehicle_images_has_more: indica si hay mas imagenes por pedir al backend.
    - vehicle_images_last_batch: ultimo lote de URLs de imagenes enviado al usuario.
    - user_id: identificador de conversacion (en web/whatsapp suele ser el telefono).
    - lead_phone_attempts: reintentos al validar telefono en plataformas que lo piden.
    - lead_capture_done: True cuando ya se notifico y persistio el lead en esta conversacion.
    """

    messages: list[dict[str, Any]]
    current_node: str
    intent: str
    selected_car: str
    selected_vehicle_id: str
    customer_info: dict[str, Any]
    last_vehicle_candidates: list[dict[str, Any]]
    last_bot_message: str
    skip_car_prompt: bool
    skip_lead_prompt: bool
    resume_to_step: str
    is_faq_interrupt: bool
    awaiting_purchase_confirmation: bool
    platform: str
    user_id: str
    lead_phone_attempts: int
    lead_capture_done: bool
    vehicle_images_cursor: int
    vehicle_images_has_more: bool
    vehicle_images_last_batch: list[str]
