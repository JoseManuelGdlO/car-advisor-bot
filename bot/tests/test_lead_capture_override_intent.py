from __future__ import annotations

from unittest.mock import patch

from src.nodes.lead_capture import lead_capture
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

    def test_notify_failure_still_persists_completed_lead_event(self) -> None:
        state = initial_state()
        state["current_node"] = "lead_capture"
        state["selected_car"] = "Dodge Ram 2015"
        state["selected_vehicle_id"] = "veh-1"
        state["user_id"] = "session-123"
        state["owner_user_id"] = "owner-123"
        state["customer_info"] = {
            "nombre": "Javier Karim Reyes",
            "telefono": "5512345678",
        }
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Cual es tu correo electronico?",
                "type": "AIMessage",
            }
        ]

        with (
            patch("src.nodes.lead_capture.classify_lead_capture_navigation", return_value=""),
            patch("src.nodes.lead_capture.safe_llm_format", side_effect=lambda text: text),
            patch("src.nodes.lead_capture.notify_advisor", side_effect=RuntimeError("push down")) as notify_mock,
            patch("src.nodes.lead_capture.push_event_to_backend") as event_mock,
        ):
            updated = lead_capture(with_user_message(state, "javier@karim.com"))

        self.assertTrue(updated.get("lead_capture_done"))
        self.assertEqual(updated.get("current_node"), "router")
        self.assertIn("problema temporal", updated["messages"][-1]["content"])
        notify_mock.assert_called_once()
        event_mock.assert_called_once()
        event_payload = event_mock.call_args.args[0]
        self.assertEqual(event_payload["message"], "lead_capture_completed")
        self.assertEqual(event_payload["customer_info"]["email"], "javier@karim.com")

