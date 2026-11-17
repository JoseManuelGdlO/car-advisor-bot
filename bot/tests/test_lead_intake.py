from __future__ import annotations

import unittest
from unittest.mock import patch

from src.nodes.router import router
from src.utils.lead_intake import detect_lead_intake
from tests.test_helpers import initial_state, with_user_message

_WELCOME = "Bienvenido a la agencia."

_LUIS_FORM = (
    "Nombre: Luis Velarde\n"
    "Teléfono: 6121234567\n"
    "Correo: luis.velarde@gmail.com\n"
    "¿Cómo planeas adquirir tu vehículo?: Financiamiento\n"
    "¿Cuál es tu presupuesto?: Menor a $200,000\n"
    "¿Cuándo planeas comprar?: 0-3 meses"
)


class TestDetectLeadIntake(unittest.TestCase):
    def test_luis_form_matches_contact_and_extracts_fields(self) -> None:
        lead = detect_lead_intake(_LUIS_FORM)
        self.assertIsNotNone(lead)
        assert lead is not None
        self.assertEqual(lead.get("matched_by"), "contact")
        self.assertEqual(lead.get("nombre"), "Luis Velarde")
        self.assertEqual(lead.get("telefono"), "6121234567")
        self.assertEqual(lead.get("email"), "luis.velarde@gmail.com")
        self.assertEqual(lead.get("presupuesto"), "menor a $200,000")
        self.assertEqual(lead.get("plazo_compra"), "0-3 meses")
        self.assertEqual(lead.get("payment_type"), "financiado")
        self.assertNotEqual(lead.get("telefono"), "200000")

    def test_budget_and_timeline_without_email_matches(self) -> None:
        lead = detect_lead_intake(
            "Mi presupuesto es menor a $200,000 y quiero compra en 0-3 meses"
        )
        self.assertIsNotNone(lead)
        assert lead is not None
        self.assertEqual(lead.get("matched_by"), "budget_timeline")
        self.assertEqual(lead.get("presupuesto"), "menor a $200,000")
        self.assertEqual(lead.get("plazo_compra"), "0-3 meses")
        self.assertNotIn("email", lead)

    def test_thanks_is_not_lead_intake(self) -> None:
        self.assertIsNone(detect_lead_intake("Gracias"))

    def test_facebook_link_is_not_lead_intake(self) -> None:
        self.assertIsNone(detect_lead_intake("https://facebook.com/share/abc"))

    def test_budget_alone_is_not_lead_intake(self) -> None:
        self.assertIsNone(detect_lead_intake("Mi presupuesto es 200000"))

    def test_financing_alone_is_not_lead_intake(self) -> None:
        self.assertIsNone(detect_lead_intake("Quiero financiamiento"))

    def test_full_name_line_extracts_nombre(self) -> None:
        lead = detect_lead_intake(
            "Full name: Luis Velarde\n"
            "Phone number: 6121234567\n"
            "Email: luis.velarde@gmail.com\n"
            "¿Cuál es tu presupuesto aprox?: Menos de $200,000\n"
            "¿Tiempo de compra?: 0-3 meses"
        )
        self.assertIsNotNone(lead)
        assert lead is not None
        self.assertEqual(lead.get("nombre"), "Luis Velarde")


class TestRouterLeadIntake(unittest.TestCase):
    def test_welcome_this_turn_form_escalates_to_advisor(self) -> None:
        state = with_user_message(initial_state(), _LUIS_FORM)
        state["onboarding_greeting_done"] = True
        state["onboarding_welcome_sent_this_turn"] = True
        state["messages"] = list(state["messages"]) + [
            {"role": "assistant", "content": _WELCOME, "type": "AIMessage"}
        ]
        state["customer_info"] = {}
        state["user_id"] = "u1"
        state["owner_user_id"] = "owner-uuid"

        with (
            patch("src.nodes.router.classify_router_intent") as mock_cls,
            patch("src.utils.human_advisor_notify.push_event_to_backend") as ev,
            patch("src.utils.human_advisor_notify.notify_advisor", return_value=True),
            patch("src.utils.financing_advisor_notify.get_bot_settings", return_value={}),
        ):
            out = router(dict(state))

        mock_cls.assert_not_called()
        self.assertTrue(out.get("human_advisor_push_sent"))
        self.assertTrue(out.get("bot_disabled"))
        self.assertEqual(out.get("intent"), "human_advisor")
        info = out.get("customer_info") or {}
        self.assertEqual(info.get("nombre"), "Luis Velarde")
        self.assertEqual(info.get("telefono"), "6121234567")
        self.assertEqual(info.get("email"), "luis.velarde@gmail.com")
        ev.assert_called_once()
        payload = ev.call_args[0][0]
        self.assertEqual(payload.get("message"), "Lead de formulario recibido")
        prefs = payload.get("purchase_preferences") or {}
        self.assertEqual(prefs.get("presupuesto"), "menor a $200,000")
        self.assertEqual(prefs.get("plazo_compra"), "0-3 meses")
        self.assertEqual(prefs.get("payment_type"), "financiado")
        self.assertNotIn("matched_by", prefs)

    def test_seminuevos_still_routes_to_faq(self) -> None:
        state = with_user_message(initial_state(), "tienen carros seminuevos?")
        with patch("src.nodes.router.classify_router_intent") as mock_cls:
            out = router(dict(state))
        mock_cls.assert_not_called()
        self.assertEqual(out.get("current_node"), "faq")
        self.assertEqual(out.get("intent"), "faq")
        self.assertFalse(out.get("human_advisor_push_sent"))
