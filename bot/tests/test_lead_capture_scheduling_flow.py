"""Flujo lead_capture: enlace de agenda, notificacion y desactivacion del bot."""

from __future__ import annotations

from unittest.mock import patch

import unittest

from src.nodes.lead_capture import lead_capture
from src.services.llm_responses import DEFAULT_CALENDAR_SCHEDULING_URL
from tests.test_helpers import initial_state, with_user_message


class LeadCaptureSchedulingFlowTests(unittest.TestCase):
    def test_single_turn_shows_calendar_link_notifies_and_deactivates(self) -> None:
        state = initial_state()
        state["current_node"] = "lead_capture"
        state["intent"] = "lead_capture"
        state["selected_car"] = "Honda Civic 2020"
        state["selected_vehicle_id"] = "veh-civic"
        state["owner_user_id"] = "owner-uuid-test"
        state["user_id"] = "session-scheduling"

        scheduling_text = (
            f"Perfecto. Para agendar tu prueba de manejo o ver Honda Civic 2020 en persona:\n\n"
            f"1. Abre este enlace: {DEFAULT_CALENDAR_SCHEDULING_URL}\n"
            "2. Elige la fecha y hora que te convenga.\n"
            "3. Completa tus datos en el formulario y confirma la cita.\n\n"
            "Al confirmar, recibiras un correo con los detalles de tu cita."
        )

        with (
            patch("src.nodes.lead_capture.classify_lead_capture_navigation", return_value=""),
            patch(
                "src.nodes.lead_capture.generate_lead_capture_scheduling_message",
                return_value=scheduling_text,
            ),
            patch("src.nodes.lead_capture.notify_advisor") as notify_mock,
            patch("src.nodes.lead_capture.push_event_to_backend") as event_mock,
            patch("src.nodes.lead_capture.deactivate_bot", side_effect=lambda s, **_: {**s, "bot_disabled": True}),
        ):
            s = lead_capture(with_user_message(state, "si quiero agendar"))

        self.assertTrue(s.get("lead_capture_done"))
        self.assertTrue(s.get("bot_disabled"))
        self.assertEqual(s.get("current_node"), "router")

        last_msg = str(s["messages"][-1].get("content", ""))
        self.assertIn("Honda Civic 2020", last_msg)
        self.assertIn(DEFAULT_CALENDAR_SCHEDULING_URL, last_msg)
        self.assertNotIn("nombre completo", last_msg.lower())
        self.assertNotIn("correo electronico", last_msg.lower())

        notify_mock.assert_called_once()
        event_mock.assert_called_once()
        payload = event_mock.call_args.args[0]
        self.assertEqual(payload["message"], "lead_capture_completed")
        self.assertEqual(payload["customer_info"], {})
        self.assertEqual(payload["selected_car"], "Honda Civic 2020")

    def test_already_done_does_not_repeat_link(self) -> None:
        state = initial_state()
        state["lead_capture_done"] = True
        state["selected_car"] = "Honda Civic 2020"
        state["current_node"] = "lead_capture"

        with patch(
            "src.nodes.lead_capture.generate_verified_user_message",
            side_effect=lambda **kw: kw["fallback"],
        ):
            s = lead_capture(with_user_message(state, "como agendo"))

        self.assertEqual(s.get("current_node"), "router")
        last_msg = str(s["messages"][-1].get("content", ""))
        self.assertIn("Honda Civic 2020", last_msg)
        self.assertNotIn(DEFAULT_CALENDAR_SCHEDULING_URL, last_msg)


if __name__ == "__main__":
    unittest.main()
