from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class AnswerFirstContractTests(GraphTestCase):
    def test_catalog_unavailable_model_answers_then_lists_options(self) -> None:
        vehicles = [
            {"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"},
            {"id": "veh-2", "brand": "Dodge", "model": "Ram", "year": 2015, "status": "available"},
        ]
        state = with_user_message(initial_state(), "el mazda 3 sirve para ciudad o carretera?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.generate_grounded_answer", return_value="No tengo ficha tecnica suficiente para confirmarlo con precision."),
            patch("src.nodes.car_selection.safe_llm_format", side_effect=lambda text: text),
        ):
            updated = self.graph.invoke(state)

        answer = str(updated["messages"][-1]["content"])
        self.assertIn("No tengo ficha tecnica suficiente", answer)
        self.assertIn("Nissan", answer)
        self.assertIn("Dodge", answer)
        self.assertIn("te ayudo a comparar", answer.lower())

    def test_financing_uses_answer_first_contract(self) -> None:
        plans = [
            {
                "id": "plan-1",
                "name": "Shilo",
                "lender": "BBVA",
                "active": True,
                "vehicles": [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"}],
                "requirements": [{"title": "Cuenta de banco"}],
                "rate": 1.0,
                "showRate": True,
                "maxTermMonths": 12,
            }
        ]
        state = with_user_message(initial_state(), "tienen pagos a plazos?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.financing.fetch_financing_plans", return_value=plans),
            patch("src.nodes.financing.generate_grounded_answer", return_value="Si, manejamos pagos a plazos con tasa y plazo definidos."),
        ):
            updated = self.graph.invoke(state)

        answer = str(updated["messages"][-1]["content"])
        self.assertIn("manejamos pagos a plazos", answer.lower())
        self.assertIn("Shilo", answer)
        self.assertIn("dime el nombre o numero del plan", answer.lower())

    def test_router_prioritizes_vehicle_on_hybrid_question(self) -> None:
        state = initial_state()
        state = with_user_message(state, "donde estan ubicados y tienes versa?")
        with patch("src.nodes.router.classify_router_intent", return_value="FAQ"):
            updated = self.graph.invoke(state)
        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertEqual(updated.get("intent"), "vehicle_catalog")
