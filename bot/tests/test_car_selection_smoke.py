from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class CarSelectionSmokeTests(GraphTestCase):
    def test_smoke_general_catalog_request_shows_available(self) -> None:
        vehicles = [
            {"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"},
            {"id": "veh-2", "brand": "Dodge", "model": "Ram", "year": 2015, "status": "available"},
        ]
        state = with_user_message(initial_state(), "que carros tienes")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
        ):
            updated = self.graph.invoke(state)
        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertIn("Nissan", str(updated["messages"][-1]["content"]))
