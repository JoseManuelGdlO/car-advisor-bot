from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class FinancingFlowTests(GraphTestCase):
    def test_financing_multi_vehicle_to_lead_capture_notifies_and_returns_router(self) -> None:
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

    def test_multiturn_versa_faq_interruption_to_financing_plan_and_lead_capture(self) -> None:
        versa_2011 = {
            "id": "veh-versa-2011",
            "brand": "Nissan",
            "model": "Versa",
            "year": 2011,
            "status": "available",
            "price": 3000000,
            "km": 0,
            "transmission": "si",
            "engine": "si",
            "color": "verde",
            "description": "Barato pa que salga",
        }
        versa_2001 = {
            "id": "veh-versa-2001",
            "brand": "Nissan",
            "model": "Versa",
            "year": 2001,
            "status": "available",
            "price": 1200000,
            "km": 90000,
            "transmission": "manual",
            "engine": "1.6",
            "color": "gris",
            "description": "",
        }
        shilo_plan = {
            "id": "plan-shilo",
            "name": "financiamiento shilo",
            "lender": "BBVA",
            "active": True,
            "vehicles": [{"id": "veh-versa-2011", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"}],
            "requirements": [{"title": "Cuenta de banco"}],
            "rate": 1.0,
            "showRate": True,
            "maxTermMonths": 12,
        }
        plan_test = {
            "id": "plan-test",
            "name": "Test",
            "lender": "Test",
            "active": True,
            "vehicles": [{"id": "veh-versa-2011", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"}],
            "requirements": [{"title": "Requisito y cuenta de banco"}],
            "rate": 12.0,
            "showRate": True,
            "maxTermMonths": 48,
        }

        def faq_flags(_current_node: str, _last_bot: str, user_message: str, **_kwargs: object) -> dict[str, bool]:
            return {"interrumpir_por_faq": "ubicad" in user_message.lower()}

        state = initial_state()
        state["platform"] = "web"
        state["user_id"] = "5512345678"

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", side_effect=faq_flags),
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["Estamos ubicados por el colegio REX."]),
            patch("src.nodes.faq.generate_faq_response", return_value="Estamos ubicados por el colegio REX."),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[versa_2011, versa_2001]),
            patch("src.nodes.car_selection.search_vehicles", side_effect=[[versa_2011, versa_2001], [versa_2011]]),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=versa_2011),
            patch("src.nodes.car_selection.fetch_vehicle_images", return_value={"images": ["Imagen del vehiculo"], "nextCursor": 1, "hasMore": False, "mode": "top"}),
            patch("src.nodes.car_selection.generate_vehicle_candidates_selection_message", return_value="1. Nissan Versa 2011\n2. Nissan Versa 2001"),
            patch("src.nodes.car_selection.generate_vehicle_detail_intro", return_value="Aqui tienes la información completa del Nissan Versa 2011. 😊"),
            patch("src.nodes.car_selection.safe_llm_format", side_effect=lambda text: text),
            patch("src.nodes.financing.fetch_vehicles", return_value=[versa_2011, versa_2001]),
            patch("src.nodes.financing.search_vehicles", return_value=[versa_2011]),
            patch("src.nodes.financing.fetch_financing_plans_by_vehicle", return_value=[shilo_plan, plan_test]),
            patch("src.nodes.financing.safe_llm_format", side_effect=lambda text: text),
            patch("src.nodes.financing.classify_financing_plan_selection_intent", return_value="ASK_EXPLICIT_PLAN"),
            patch("src.nodes.lead_capture.safe_llm_format", side_effect=lambda text: text),
            patch("src.nodes.lead_capture.notify_advisor") as notify_mock,
            patch("src.nodes.lead_capture.push_event_to_backend") as event_mock,
        ):
            state = self.graph.invoke(with_user_message(state, "tienes carros versa?"))
            state = self.graph.invoke(with_user_message(state, "Cómo es el nissan versa 2011?"))
            state = self.graph.invoke(with_user_message(state, "dónde estan ubicados?"))
            self.assertIn("colegio REX", state["messages"][-1]["content"])

            state = self.graph.invoke(with_user_message(state, "si me interesa el vehiculo, pero no tienen planes de financiamiento?"))
            self.assertEqual(state.get("current_node"), "financing")

            state = self.graph.invoke(with_user_message(state, "el shilo suena interesante"))
            self.assertEqual(state.get("selected_financing_plan_id"), "")

            state = self.graph.invoke(with_user_message(state, "el financiamiento shilo"))
            self.assertEqual(state.get("current_node"), "lead_capture")
            self.assertEqual(state.get("selected_financing_plan_id"), "plan-shilo")

            state = self.graph.invoke(with_user_message(state, "javier karim reyes"))
            state = self.graph.invoke(with_user_message(state, "javier@kaim.com"))
            self.assertTrue(state.get("lead_capture_done"))
            self.assertEqual(state.get("current_node"), "router")
            notify_mock.assert_called_once()
            event_mock.assert_called_once()

