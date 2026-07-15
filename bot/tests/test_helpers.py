"""Utilidades compartidas para tests de integración del grafo LangGraph.

Expone `build_graph()`, un `initial_state()` alineado con `clientState` en `src/state.py`,
y helpers para anexar mensajes del usuario. Usar `GraphTestCase` cuando el test invoque
el grafo compilado completo.
"""

from __future__ import annotations

import unittest

from src.graph import build_graph


def initial_state() -> dict:
    """Estado mínimo coherente con `clientState` antes del primer `invoke`."""
    return {
        "messages": [],
        "current_node": "start",
        "intent": "",
        "selected_car": "",
        "selected_vehicle_id": "",
        "customer_info": {"nombre": "Cliente Prueba"},
        "last_vehicle_candidates": [],
        "last_bot_message": "",
        "skip_car_prompt": False,
        "skip_lead_prompt": False,
        "resume_to_step": "",
        "is_faq_interrupt": False,
        "awaiting_purchase_confirmation": False,
        "platform": "web",
        "user_id": "",
        "owner_user_id": "",
        "lead_capture_done": False,
        "vehicle_images_cursor": 0,
        "vehicle_images_has_more": False,
        "vehicle_images_last_batch": [],
        "technical_sheet_delivered_vehicle_id": "",
        "selected_financing_plan_id": "",
        "selected_financing_plan_name": "",
        "selected_financing_plan_lender": "",
        "financing_plan_candidates": [],
        "financing_vehicle_candidates": [],
        "awaiting_financing_plan_selection": False,
        "awaiting_financing_vehicle_selection": False,
        "show_selected_vehicle_detail_once": False,
        "selected_promotion_id": "",
        "selected_promotion_title": "",
        "selected_promotion_description": "",
        "selected_promotion_valid_until": "",
        "selected_promotion_vehicle_ids": [],
        "promotion_candidates": [],
        "promotion_vehicle_candidates": [],
        "awaiting_promotion_selection": False,
        "awaiting_promotion_vehicle_selection": False,
        "awaiting_promotion_vehicle_interest_confirmation": False,
        "awaiting_promotion_apply_confirmation": False,
        "pending_financing_after_promotion": False,
        "vehicle_comparison_ctx": {},
        "human_advisor_requested": False,
        "human_advisor_push_sent": False,
        "financing_detail_push_sent": False,
        "display_phone": "",
        "last_faq_interrupt_topic": "",
        "financing_interrupt_snapshot": {},
        "financing_credit_followup_pending": False,
        "suppress_commercial_node_once": False,
        "conversation_id": "",
        "bot_disabled": False,
        "awaiting_customer_name": False,
        "onboarding_greeting_done": True,
        "onboarding_turn_complete": False,
        "pending_onboarding_user_message": "",
        "onboarding_resume_user_message": "",
        "deferred_faq_user_message": "",
        "onboarding_welcome_sent_this_turn": False,
        "ad_campaign_shortcut": False,
        "ad_campaign_shortcut_applied": False,
    }


def with_user_message(state: dict, message: str) -> dict:
    updated = dict(state)
    messages = list(updated.get("messages", []))
    messages.append({"role": "user", "content": message, "type": "HumanMessage"})
    updated["messages"] = messages
    return updated


class GraphTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.graph = build_graph()
