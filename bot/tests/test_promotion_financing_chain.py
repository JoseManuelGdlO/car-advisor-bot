from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message

_VEHICLE_ID = "525eee39-05b4-4dd3-b8d2-ad3d2a2523b4"
_PROMO_ID = "promo-bono-verano"
_PLAN_ID = "plan-demo"

_JETTA = {
    "id": _VEHICLE_ID,
    "brand": "Volkswagen",
    "model": "Jetta",
    "trim": "Comfortline",
    "year": 2020,
    "status": "available",
    "price": 320000,
}

_FINANCING_PLAN = {
    "id": _PLAN_ID,
    "name": "Financiamiento Demo",
    "lender": "BBVA",
    "active": True,
    "vehicles": [_JETTA],
}

_PROMOTION = {
    "id": _PROMO_ID,
    "title": "Bono verano",
    "description": "Descuento especial",
    "validUntil": "2026-12-31",
    "vehicleIds": [_VEHICLE_ID],
    "active": True,
}

_NAV_FLAGS_APPLY_ONLY = {
    "ask_financing": False,
    "ask_other_vehicles": False,
    "ask_promotions": False,
    "wants_compare_two_promotions": False,
    "select_promotion": True,
    "apply_promotion": True,
    "ask_promotion_vehicle_info": False,
    "cancel_promotion_flow": False,
    "confirm_yes": False,
    "confirm_no": False,
}

_NAV_FLAGS_COMPOUND = {
    "ask_financing": True,
    "ask_other_vehicles": False,
    "ask_promotions": False,
    "wants_compare_two_promotions": False,
    "select_promotion": True,
    "apply_promotion": True,
    "ask_promotion_vehicle_info": False,
    "cancel_promotion_flow": False,
    "confirm_yes": False,
    "confirm_no": False,
}


class PromotionFinancingChainTests(GraphTestCase):
    def _base_state(self) -> dict:
        state = initial_state()
        state["current_node"] = "promotions"
        state["intent"] = "promotions"
        state["awaiting_promotion_selection"] = True
        state["selected_vehicle_id"] = _VEHICLE_ID
        state["selected_car"] = "Volkswagen Jetta Comfortline 2020"
        state["promotion_candidates"] = [_PROMOTION]
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Promociones aplicables al Jetta...",
                "type": "AIMessage",
            }
        ]
        return state

    def test_apply_promotion_then_financing_same_turn_no_loop(self) -> None:
        state = with_user_message(
            self._base_state(),
            "aplico la promocion, hay plan de financiamiento?",
        )
        with (
            patch(
                "src.nodes.intent_checker.classify_faq_interrupt_flags",
                return_value={"interrumpir_por_faq": False},
            ),
            patch(
                "src.nodes.promotions.classify_promotions_step_flags",
                return_value=_NAV_FLAGS_COMPOUND,
            ),
            patch("src.nodes.promotions.fetch_vehicle_by_id", return_value=_JETTA),
            patch(
                "src.nodes.financing.fetch_financing_plans_by_vehicle",
                return_value=[_FINANCING_PLAN],
            ),
            patch(
                "src.nodes.financing.generate_financing_plans_user_message",
                side_effect=lambda **kw: kw["fallback_semantic"],
            ),
            patch(
                "src.nodes.financing.format_financing_plans_for_vehicle",
                return_value="1. Financiamiento Demo (BBVA)",
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertFalse(updated.get("pending_financing_after_promotion"))
        self.assertFalse(updated.get("awaiting_promotion_selection"))
        self.assertEqual(updated.get("selected_promotion_id"), _PROMO_ID)
        self.assertEqual(updated.get("selected_vehicle_id"), _VEHICLE_ID)
        assistant_messages = [
            message.get("content", "")
            for message in updated.get("messages", [])
            if message.get("role") == "assistant"
        ]
        self.assertTrue(assistant_messages)
        self.assertIn("pago a plazos", assistant_messages[-1].lower())

    def test_apply_promotion_preselected_vehicle_routes_to_lead_capture(self) -> None:
        state = with_user_message(
            self._base_state(),
            "quiero aplicar la promocion",
        )
        with (
            patch(
                "src.nodes.intent_checker.classify_faq_interrupt_flags",
                return_value={"interrumpir_por_faq": False},
            ),
            patch(
                "src.nodes.intent_checker.maybe_escalate_financing_detail",
                return_value=None,
            ),
            patch(
                "src.nodes.promotions.classify_promotions_step_flags",
                return_value=_NAV_FLAGS_APPLY_ONLY,
            ),
            patch("src.nodes.promotions.fetch_vehicle_by_id", return_value=_JETTA),
            patch(
                "src.nodes.promotions.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
            patch(
                "src.nodes.lead_capture.classify_lead_capture_navigation",
                return_value="",
            ),
            patch(
                "src.nodes.lead_capture.generate_lead_capture_scheduling_message",
                return_value="Enlace de agenda",
            ),
            patch("src.nodes.lead_capture.notify_advisor"),
            patch("src.nodes.lead_capture.push_event_to_backend"),
            patch(
                "src.nodes.lead_capture.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertTrue(updated.get("lead_capture_done"))
        self.assertFalse(updated.get("awaiting_promotion_selection"))
        self.assertFalse(updated.get("awaiting_promotion_vehicle_selection"))
        self.assertEqual(updated.get("selected_promotion_id"), _PROMO_ID)
        assistant_messages = [
            message.get("content", "")
            for message in updated.get("messages", [])
            if message.get("role") == "assistant"
        ]
        self.assertTrue(assistant_messages)
        combined = "\n".join(assistant_messages).lower()
        self.assertIn("avancemos con tus datos", combined)
        self.assertNotIn("cual quieres revisar primero", combined)

    def test_financing_skips_promotions_redirect_when_pending_chain_flag(self) -> None:
        from src.nodes.financing import financing

        state = with_user_message(
            initial_state(),
            "aplico la promocion, hay plan de financiamiento?",
        )
        state["current_node"] = "financing"
        state["intent"] = "financing"
        state["pending_financing_after_promotion"] = True
        state["selected_vehicle_id"] = _VEHICLE_ID
        state["selected_car"] = "Volkswagen Jetta Comfortline 2020"
        state["selected_promotion_id"] = _PROMO_ID
        state["selected_promotion_title"] = "Bono verano"

        with (
            patch(
                "src.nodes.financing.fetch_financing_plans_by_vehicle",
                return_value=[_FINANCING_PLAN],
            ),
            patch(
                "src.nodes.financing.generate_financing_plans_user_message",
                side_effect=lambda **kw: kw["fallback_semantic"],
            ),
            patch(
                "src.nodes.financing.format_financing_plans_for_vehicle",
                return_value="1. Financiamiento Demo (BBVA)",
            ),
        ):
            updated = financing(state)

        self.assertNotEqual(updated.get("current_node"), "promotions")
        self.assertFalse(updated.get("pending_financing_after_promotion"))


if __name__ == "__main__":
    import unittest

    unittest.main()
