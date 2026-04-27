from __future__ import annotations

import unittest

from src.graph import build_graph


def initial_state() -> dict:
    return {
        "messages": [],
        "current_node": "start",
        "intent": "",
        "selected_car": "",
        "selected_vehicle_id": "",
        "customer_info": {},
        "last_vehicle_candidates": [],
        "last_bot_message": "",
        "skip_car_prompt": False,
        "skip_lead_prompt": False,
        "resume_to_step": "",
        "is_faq_interrupt": False,
        "awaiting_purchase_confirmation": False,
        "platform": "web",
        "user_id": "",
        "lead_phone_attempts": 0,
        "lead_capture_done": False,
        "vehicle_images_cursor": 0,
        "vehicle_images_has_more": False,
        "vehicle_images_last_batch": [],
        "selected_financing_plan_id": "",
        "selected_financing_plan_name": "",
        "selected_financing_plan_lender": "",
        "financing_plan_candidates": [],
        "financing_vehicle_candidates": [],
        "awaiting_financing_plan_selection": False,
        "awaiting_financing_vehicle_selection": False,
        "show_selected_vehicle_detail_once": False,
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

