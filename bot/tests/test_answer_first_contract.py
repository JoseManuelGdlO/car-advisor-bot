from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class AnswerFirstContractTests(GraphTestCase):
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
            patch(
                "src.nodes.financing.generate_financing_plans_user_message",
                side_effect=lambda **kw: (
                    "Si, manejamos pagos a plazos con tasa y plazo definidos; estos son los planes disponibles.\n\n"
                    f"{kw.get('listing_block', '')}"
                ),
            ),
        ):
            updated = self.graph.invoke(state)

        answer = str(updated["messages"][-1]["content"])
        self.assertIn("manejamos pagos a plazos", answer.lower())
        self.assertIn("Shilo", answer)
        self.assertTrue(
            "plan" in answer.lower()
            or "planes" in answer.lower()
            or "financiamiento" in answer.lower()
        )

    def test_router_prioritizes_vehicle_on_hybrid_question(self) -> None:
        state = initial_state()
        state = with_user_message(state, "donde estan ubicados y tienes versa?")
        with patch("src.nodes.router.classify_router_intent", return_value="FAQ"):
            updated = self.graph.invoke(state)
        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertEqual(updated.get("intent"), "vehicle_catalog")
