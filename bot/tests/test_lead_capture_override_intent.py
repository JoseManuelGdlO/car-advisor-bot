from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class LeadCaptureOverrideIntentTests(GraphTestCase):
    def test_route_override_to_catalog_uses_vehicle_catalog_intent(self) -> None:
        state = initial_state()
        state["current_node"] = "lead_capture"
        state["selected_car"] = "Dodge Ram 2015"
        state["selected_vehicle_id"] = "veh-1"
        state["intent"] = "lead_capture"
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Para continuar con la compra, cual es tu nombre completo?",
                "type": "AIMessage",
            }
        ]

        with (
            patch(
                "src.nodes.intent_checker.classify_faq_interrupt_flags",
                return_value={"interrumpir_por_faq": False},
            ),
            patch("src.nodes.lead_capture.classify_lead_capture_navigation", return_value="CAR_SELECTION"),
        ):
            updated = self.graph.invoke(with_user_message(state, "quiero ver otros vehiculos"))

        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertEqual(updated.get("intent"), "vehicle_catalog")

