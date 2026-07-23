"""Flujo financing informativo (estilo FAQ): listar plan + follow-up segun paso."""

from __future__ import annotations

from unittest.mock import patch

from src.utils.purchase_flow_messages import (
    CONTACT_PREFERENCE_MESSAGE_SHORT,
    FAQ_SOFT_CATALOG_CLOSE,
    PURCHASE_PREFERENCES_REASK_BOTH,
)
from tests.test_helpers import GraphTestCase, initial_state, with_user_message

_PLAN = {
    "id": "plan-1",
    "name": "Financiamiento Shilo",
    "lender": "BBVA",
    "active": True,
    "rate": 1.0,
    "showRate": True,
    "maxTermMonths": 48,
    "requirements": [{"title": "INE"}],
    "vehicles": [
        {
            "id": "veh-versa-2011",
            "brand": "Nissan",
            "model": "Versa",
            "year": 2011,
            "status": "available",
        }
    ],
}


class FinancingFlowTests(GraphTestCase):
    def test_with_vehicle_shows_plan_and_contact_follow_up(self) -> None:
        state = initial_state()
        state["user_id"] = "5512345678"
        state["current_node"] = "financing"
        state["intent"] = "financing"
        state["selected_vehicle_id"] = "veh-versa-2011"
        state["selected_car"] = "Nissan Versa 2011"
        state = with_user_message(state, "que planes tienen de financiamiento?")

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.intent_checker.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.financing.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.financing.fetch_financing_plans_by_vehicle", return_value=[_PLAN]),
            patch("src.nodes.financing.persist_commercial_selection_to_backend") as persist_mock,
        ):
            updated = self.graph.invoke(state)

        reply = str(updated["messages"][-1]["content"])
        self.assertIn("Financiamiento Shilo", reply)
        self.assertIn(CONTACT_PREFERENCE_MESSAGE_SHORT, reply)
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        self.assertEqual(updated.get("selected_financing_plan_id"), "plan-1")
        self.assertEqual(updated.get("selected_financing_plan_name"), "Financiamiento Shilo")
        self.assertFalse(updated.get("awaiting_financing_plan_selection"))
        persist_mock.assert_called_once()
        kwargs = persist_mock.call_args.kwargs
        self.assertEqual(kwargs["financing_selection"]["plan_name"], "Financiamiento Shilo")

    def test_without_vehicle_shows_plan_and_soft_catalog(self) -> None:
        state = initial_state()
        state["user_id"] = "5512345678"
        state["current_node"] = "financing"
        state["intent"] = "financing"
        state = with_user_message(state, "tienen financiamiento?")

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.intent_checker.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.financing.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.financing.fetch_financing_plans", return_value=[_PLAN]),
            patch("src.nodes.financing.persist_commercial_selection_to_backend") as persist_mock,
        ):
            updated = self.graph.invoke(state)

        reply = str(updated["messages"][-1]["content"])
        self.assertIn("Financiamiento Shilo", reply)
        self.assertIn(FAQ_SOFT_CATALOG_CLOSE, reply)
        self.assertNotIn(CONTACT_PREFERENCE_MESSAGE_SHORT, reply)
        self.assertFalse(updated.get("awaiting_purchase_confirmation"))
        persist_mock.assert_called_once()

    def test_mid_purchase_preferences_reasks_prefs(self) -> None:
        state = initial_state()
        state["user_id"] = "5512345678"
        state["current_node"] = "financing"
        state["intent"] = "financing"
        state["selected_vehicle_id"] = "veh-versa-2011"
        state["selected_car"] = "Nissan Versa 2011"
        state["awaiting_purchase_preferences"] = True
        state = with_user_message(state, "y el financiamiento?")

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.intent_checker.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.financing.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.financing.fetch_financing_plans_by_vehicle", return_value=[_PLAN]),
            patch("src.nodes.financing.persist_commercial_selection_to_backend"),
        ):
            updated = self.graph.invoke(state)

        reply = str(updated["messages"][-1]["content"])
        self.assertIn(PURCHASE_PREFERENCES_REASK_BOTH, reply)
        self.assertTrue(updated.get("awaiting_purchase_preferences"))
        self.assertFalse(updated.get("awaiting_purchase_confirmation"))

    def test_promotions_request_hops_to_promotions(self) -> None:
        state = initial_state()
        state["current_node"] = "financing"
        state["intent"] = "financing"
        state = with_user_message(state, "tienen promociones?")

        promo = {
            "id": "promo-1",
            "title": "Bono Julio",
            "description": "Descuento",
            "validUntil": "2026-07-31",
            "active": True,
            "vehicleIds": [],
        }
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.intent_checker.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.financing.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.promotions.fetch_promotions", return_value=[promo]),
            patch("src.nodes.promotions.persist_commercial_selection_to_backend"),
        ):
            updated = self.graph.invoke(state)

        reply = str(updated["messages"][-1]["content"])
        self.assertIn("Bono Julio", reply)
        self.assertIn(FAQ_SOFT_CATALOG_CLOSE, reply)

    def test_contact_follow_up_next_turn_goes_to_lead_capture(self) -> None:
        state = initial_state()
        state["user_id"] = "5512345678"
        state["owner_user_id"] = "owner-1"
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_vehicle_id"] = "veh-versa-2011"
        state["selected_car"] = "Nissan Versa 2011"
        state["awaiting_purchase_confirmation"] = True
        state["selected_financing_plan_id"] = "plan-1"
        state["selected_financing_plan_name"] = "Financiamiento Shilo"
        state["selected_financing_plan_lender"] = "BBVA"
        state["last_bot_message"] = CONTACT_PREFERENCE_MESSAGE_SHORT
        state["messages"] = [
            {
                "role": "assistant",
                "content": f"Planes...\n\n{CONTACT_PREFERENCE_MESSAGE_SHORT}",
                "type": "AIMessage",
            }
        ]
        state = with_user_message(state, "whatsapp")
        vehicles = [
            {
                "id": "veh-versa-2011",
                "brand": "Nissan",
                "model": "Versa",
                "year": 2011,
                "status": "available",
            }
        ]

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch(
                "src.nodes.car_selection.classify_vehicle_step_flags",
                return_value={
                    "ask_promotions": False,
                    "ask_financing": False,
                    "ask_images": False,
                    "ask_more_images": False,
                    "wants_compare_two_vehicles": False,
                    "wants_other_vehicles": False,
                    "confirm_purchase": False,
                    "reject_purchase": False,
                },
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
        self.assertEqual(updated.get("contact_method"), "whatsapp")
