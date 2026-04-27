from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class Flow02FinancingPlanVehicleLeadRouterTests(GraphTestCase):
    def test_flow_02_financing_plan_vehicle_lead_router(self) -> None:
        plan_a = {
            "id": "plan-a",
            "name": "Financiamiento Shilo",
            "lender": "BBVA",
            "active": True,
            "vehicles": [
                {"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"},
                {"id": "veh-2", "brand": "Nissan", "model": "Versa", "year": 2001, "status": "available"},
            ],
        }
        plan_b = {
            "id": "plan-b",
            "name": "Plan Premium",
            "lender": "Santander",
            "active": True,
            "vehicles": [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"}],
        }
        vehicle_hint = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"}]
        state = initial_state()
        state["platform"] = "web"
        state["user_id"] = "5512345678"

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.financing.fetch_vehicles", return_value=vehicle_hint),
            patch("src.nodes.financing.search_vehicles", return_value=vehicle_hint),
            patch("src.nodes.financing.fetch_financing_plans_by_vehicle", return_value=[plan_a, plan_b]),
            patch("src.nodes.financing.safe_llm_format", side_effect=lambda text: text),
            patch("src.nodes.lead_capture.safe_llm_format", side_effect=lambda text: text),
            patch("src.nodes.lead_capture.notify_advisor") as notify_mock,
            patch("src.nodes.lead_capture.push_event_to_backend") as event_mock,
        ):
            state = self.graph.invoke(with_user_message(state, "quiero financiamiento para un versa 2011"))
            self.assertTrue(state.get("awaiting_financing_plan_selection"))

            state = self.graph.invoke(with_user_message(state, "1"))
            self.assertTrue(state.get("awaiting_financing_vehicle_selection"))

            state = self.graph.invoke(with_user_message(state, "2"))
            self.assertEqual(state.get("current_node"), "lead_capture")
            self.assertEqual(state.get("selected_vehicle_id"), "veh-2")

            state = self.graph.invoke(with_user_message(state, "Javier Karim Reyes"))
            self.assertIn("correo", state["messages"][-1]["content"].lower())

            state = self.graph.invoke(with_user_message(state, "javier@karim.com"))
            self.assertTrue(state.get("lead_capture_done"))
            self.assertEqual(state.get("current_node"), "router")
            notify_mock.assert_called_once()
            event_mock.assert_called_once()

