"""Flujo lead_capture: datos incorrectos en resumen, correccion y confirmacion antes del CRM."""

from __future__ import annotations

from unittest.mock import patch

import unittest

from src.nodes.lead_capture import _collect_missing_contact_fields, lead_capture
from tests.test_helpers import initial_state, with_user_message


class LeadCaptureSummaryCorrectionFlowTests(unittest.TestCase):
    def test_wrong_email_in_summary_then_correct_and_confirm_creates_lead(self) -> None:
        """Tras el resumen el usuario indica error de correo, envia el buen email y confirma: se hace push al backend."""
        state = initial_state()
        state["current_node"] = "lead_capture"
        state["intent"] = "lead_capture"
        state["selected_car"] = "Honda Civic 2020"
        state["selected_vehicle_id"] = "veh-civic"
        state["owner_user_id"] = "owner-uuid-test"
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Para seguir con tu interes, cual es tu nombre completo?",
                "type": "AIMessage",
            }
        ]

        with (
            patch("src.nodes.lead_capture.classify_lead_capture_navigation", return_value=""),
            patch(
                "src.nodes.lead_capture.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
            patch(
                "src.nodes.lead_capture.classify_lead_capture_summary_confirmation",
                side_effect=["EDIT_EMAIL", "CONFIRM"],
            ),
            patch("src.nodes.lead_capture.notify_advisor") as notify_mock,
            patch("src.nodes.lead_capture.push_event_to_backend") as event_mock,
            patch("src.nodes.lead_capture.deactivate_bot", side_effect=lambda s, **_: s),
        ):
            # Input con prefijo conversacional y signos de puntuacion alrededor: el
            # extractor debe persistir solo el nombre limpio (sin "mi nombre es" ni "!").
            s = lead_capture(with_user_message(state, "¡Mi nombre es Ana Maria Gomez Lopez!"))
            self.assertEqual(s["customer_info"].get("nombre"), "Ana Maria Gomez Lopez")
            self.assertIn("telefono", s["messages"][-1]["content"].lower())

            s = lead_capture(with_user_message(s, "5512345678"))
            self.assertIn("correo", s["messages"][-1]["content"].lower())

            # Email con typo de dominio (valido sintacticamente) hasta ver el resumen.
            s = lead_capture(with_user_message(s, "ana@gmai.com"))
            self.assertTrue(s.get("awaiting_lead_capture_final_confirmation"))
            self.assertEqual(s["customer_info"].get("email"), "ana@gmai.com")
            self.assertIn("Revisa tus datos", s["messages"][-1]["content"])

            s = lead_capture(with_user_message(s, "el correo electronico esta mal"))
            self.assertFalse(s.get("awaiting_lead_capture_final_confirmation"))
            self.assertIsNone(s["customer_info"].get("email"))
            self.assertFalse(s.get("lead_capture_done"))

            # Email de correccion tras resumen embebido en una frase: debe extraerse limpio.
            s = lead_capture(with_user_message(s, "mi correo es ana@gmail.com"))
            self.assertTrue(s.get("awaiting_lead_capture_final_confirmation"))
            self.assertEqual(s["customer_info"].get("email"), "ana@gmail.com")
            self.assertIn("Revisa tus datos", s["messages"][-1]["content"])

            s = lead_capture(with_user_message(s, "si, confirmo"))

        self.assertTrue(s.get("lead_capture_done"))
        self.assertEqual(s.get("current_node"), "router")
        self.assertFalse(s.get("awaiting_lead_capture_final_confirmation"))
        notify_mock.assert_called_once()
        event_mock.assert_called_once()
        payload = event_mock.call_args.args[0]
        self.assertEqual(payload["message"], "lead_capture_completed")
        self.assertEqual(payload["customer_info"]["email"], "ana@gmail.com")
        self.assertEqual(payload["customer_info"]["nombre"], "Ana Maria Gomez Lopez")
        self.assertEqual(payload["customer_info"]["telefono"], "5512345678")
        close_msg = str(s["messages"][-1].get("content", "")).lower()
        self.assertNotIn("asesor", close_msg)
        self.assertIn("contactamos", close_msg)

    def test_collect_missing_returns_none_when_email_filled_same_turn(self) -> None:
        """Si faltaba solo el correo y el usuario lo envia en el mismo turno, el colector devuelve None para seguir al resumen."""
        state = initial_state()
        state["customer_info"] = {
            "nombre": "Ana Maria Gomez Lopez",
            "telefono": "5512345678",
        }
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Cual es tu correo electronico?",
                "type": "AIMessage",
            }
        ]
        with patch(
            "src.nodes.lead_capture.generate_verified_user_message",
            side_effect=lambda **kw: kw["fallback"],
        ):
            # Mensaje con prefijo conversacional: el extractor debe rescatar el email puro.
            raw_user_message = "mi correo es ana@gmail.com"
            s = with_user_message(state, raw_user_message)
            out = _collect_missing_contact_fields(
                s,
                selected_car="Honda Civic 2020",
                platform="web",
                user_id="",
                latest_user=raw_user_message,
            )
        self.assertIsNone(out)
        self.assertEqual(s["customer_info"].get("email"), "ana@gmail.com")


if __name__ == "__main__":
    unittest.main()
