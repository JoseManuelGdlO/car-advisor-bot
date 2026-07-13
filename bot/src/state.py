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
    - customer_info: datos de contacto opcionales (p. ej. escalacion a asesor humano).

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
    - vehicle_images_last_batch: ultimo lote de URLs de imagenes enviado al usuario (vacio = aun no se enviaron fotos).
    - user_id: identificador de conversacion (en web/whatsapp suele ser el telefono).
    - owner_user_id: UUID del tenant (vendedor). Obligatorio en /chat con token global antes de leer catálogo; viene del webhook o body.
    - lead_capture_done: True cuando ya se compartio el enlace de agenda, se notifico interes y el bot quedo desactivado.
    - selected_financing_plan_*: datos del plan seleccionado por el usuario.
    - financing_plan_candidates: lista temporal de planes para seleccion.
    - financing_vehicle_candidates: lista temporal de vehiculos dentro del plan.
    - awaiting_financing_plan_selection / awaiting_financing_vehicle_selection: banderas de paso.
    - show_selected_vehicle_detail_once: fuerza mostrar detalle del vehiculo ya seleccionado al entrar a car_selection.
    - selected_promotion_*: promocion elegida/aplicable durante el flujo.
    - promotion_candidates / promotion_vehicle_candidates: listas temporales para seleccion.
    - awaiting_promotion_selection / awaiting_promotion_vehicle_selection / awaiting_promotion_vehicle_interest_confirmation:
      banderas de paso para nodo promotions.
    - awaiting_promotion_apply_confirmation: el bot mostro un resumen de una promo y espera confirmacion para avanzar.
    - pending_financing_after_promotion: promotions aplico una promo y el mismo turno debe continuar en financing.
    - vehicle_comparison_ctx: contexto opcional para desambiguar comparacion de dos vehiculos
      (claves: other_query str, peer_resolved_id str opcional).
    - human_advisor_requested: True si el usuario pidio hablar con un asesor humano (CRM/UI).
    - human_advisor_push_sent: True tras intentar notificar al owner una vez por sesion (evita spam).
    - financing_detail_push_sent: True tras notificar dudas detalladas de financiamiento al asesor.
    - display_phone: telefono legible del cliente (displayPhone CRM) para notificaciones.
    - last_faq_interrupt_topic: tema de la ultima FAQ interruptiva (p. ej. credit_requirements).
    - financing_interrupt_snapshot: banderas comerciales de financing suspendidas durante FAQ de credito.
    - financing_credit_followup_pending: True tras FAQ de credito que ofrecio contacto con asesor.
    - suppress_commercial_node_once: el siguiente paso por el nodo comercial actual no genera respuesta nueva
      (tras ack de asesor humano desde intent_checker).
    - conversation_id: UUID de conversacion CRM para handoff y persistencia.
    - bot_disabled: True tras notificar handoff; el servidor no invoca el grafo en turnos siguientes.
    - awaiting_customer_name: True mientras esperamos que el usuario comparta su nombre.
    - onboarding_greeting_done: True tras enviar la bienvenida inicial (con o sin nombre conocido).
    - onboarding_turn_complete: True cuando el nodo onboarding genero respuesta y debe terminar el turno.
    - pending_onboarding_user_message: primer mensaje del usuario con intencion comercial mientras faltaba el nombre.
    - onboarding_resume_user_message: mensaje del usuario a procesar tras capturar el nombre.
    - onboarding_welcome_sent_this_turn: True si onboarding acaba de enviar bienvenida y el router no debe duplicarla.
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
    owner_user_id: str
    lead_capture_done: bool
    vehicle_images_cursor: int
    vehicle_images_has_more: bool
    vehicle_images_last_batch: list[str]
    selected_financing_plan_id: str
    selected_financing_plan_name: str
    selected_financing_plan_lender: str
    financing_plan_candidates: list[dict[str, Any]]
    financing_vehicle_candidates: list[dict[str, Any]]
    awaiting_financing_plan_selection: bool
    awaiting_financing_vehicle_selection: bool
    show_selected_vehicle_detail_once: bool
    selected_promotion_id: str
    selected_promotion_title: str
    selected_promotion_description: str
    selected_promotion_valid_until: str
    selected_promotion_vehicle_ids: list[str]
    promotion_candidates: list[dict[str, Any]]
    promotion_vehicle_candidates: list[dict[str, Any]]
    awaiting_promotion_selection: bool
    awaiting_promotion_vehicle_selection: bool
    awaiting_promotion_vehicle_interest_confirmation: bool
    awaiting_promotion_apply_confirmation: bool
    pending_financing_after_promotion: bool
    vehicle_comparison_ctx: dict[str, Any]
    human_advisor_requested: bool
    human_advisor_push_sent: bool
    financing_detail_push_sent: bool
    display_phone: str
    last_faq_interrupt_topic: str
    financing_interrupt_snapshot: dict[str, bool]
    financing_credit_followup_pending: bool
    suppress_commercial_node_once: bool
    conversation_id: str
    bot_disabled: bool
    awaiting_customer_name: bool
    onboarding_greeting_done: bool
    onboarding_turn_complete: bool
    pending_onboarding_user_message: str
    onboarding_resume_user_message: str
    onboarding_welcome_sent_this_turn: bool
