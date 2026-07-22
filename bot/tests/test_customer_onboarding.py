"""Tests del nodo customer_onboarding: gate de bienvenida literal."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from src.graph import _route_after_customer_onboarding
from src.nodes.customer_onboarding import customer_onboarding
from tests.test_helpers import GraphTestCase, initial_state, with_user_message

_WELCOME = "Bienvenido a la agencia. Estoy para ayudarte."


class CustomerOnboardingWelcomeTests(unittest.TestCase):
    def test_sends_literal_welcome_once(self) -> None:
        state = with_user_message(initial_state(), "hola quiero ver modelos")
        state["onboarding_greeting_done"] = False

        with patch(
            "src.nodes.customer_onboarding.get_bot_settings",
            return_value={"welcomeMessage": _WELCOME, "botName": "AutoBot"},
        ):
            updated = customer_onboarding(state)

        self.assertTrue(updated.get("onboarding_greeting_done"))
        self.assertTrue(updated.get("onboarding_welcome_sent_this_turn"))
        assistant = [m for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertEqual(len(assistant), 1)
        self.assertEqual(assistant[0]["content"], _WELCOME)

    def test_passthrough_when_greeting_already_done(self) -> None:
        state = with_user_message(initial_state(), "hola otra vez")
        state["onboarding_greeting_done"] = True
        state["messages"].append({"role": "assistant", "content": "prev", "type": "AIMessage"})

        with patch(
            "src.nodes.customer_onboarding.get_bot_settings",
            return_value={"welcomeMessage": _WELCOME},
        ) as settings_mock:
            updated = customer_onboarding(state)

        settings_mock.assert_not_called()
        self.assertTrue(updated.get("onboarding_greeting_done"))
        self.assertFalse(updated.get("onboarding_welcome_sent_this_turn"))
        assistant = [m for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertEqual(len(assistant), 1)
        self.assertEqual(assistant[0]["content"], "prev")

    def test_fallback_when_welcome_message_empty(self) -> None:
        state = with_user_message(initial_state(), "hola")
        state["onboarding_greeting_done"] = False

        with patch(
            "src.nodes.customer_onboarding.get_bot_settings",
            return_value={"welcomeMessage": "", "botName": "AutoBot"},
        ):
            updated = customer_onboarding(state)

        assistant = [m for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertEqual(len(assistant), 1)
        self.assertIn("AutoBot", assistant[0]["content"])
        self.assertTrue(updated.get("onboarding_greeting_done"))

    def test_route_after_onboarding_always_intent_checker(self) -> None:
        state = initial_state()
        state["onboarding_greeting_done"] = True
        self.assertEqual(_route_after_customer_onboarding(state), "intent_checker")
        state["onboarding_greeting_done"] = False
        self.assertEqual(_route_after_customer_onboarding(state), "intent_checker")


class CustomerOnboardingGraphTests(GraphTestCase):
    def test_first_turn_welcome_then_continues_to_catalog(self) -> None:
        state = with_user_message(initial_state(), "hola quiero ver el jimny")
        state["onboarding_greeting_done"] = False
        state["customer_info"] = {}

        with (
            patch(
                "src.nodes.customer_onboarding.get_bot_settings",
                return_value={"welcomeMessage": _WELCOME, "botName": "AutoBot"},
            ),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[]),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw.get("fallback", ""),
            ),
            patch(
                "src.nodes.intent_checker.classify_faq_interrupt_flags",
                return_value={"interrumpir_por_faq": False},
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertTrue(updated.get("onboarding_greeting_done"))
        self.assertEqual(updated.get("current_node"), "car_selection")
        assistant_texts = [
            str(m.get("content", ""))
            for m in updated.get("messages", [])
            if m.get("role") == "assistant"
        ]
        self.assertEqual(assistant_texts[0], _WELCOME)
        joined = "\n".join(assistant_texts).lower()
        self.assertNotIn("cómo te llamas", joined)
        self.assertNotIn("como te llamas", joined)


if __name__ == "__main__":
    unittest.main()
