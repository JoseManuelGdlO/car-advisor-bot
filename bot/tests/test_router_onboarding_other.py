from __future__ import annotations

import unittest
from unittest.mock import patch

from src.nodes.router import router
from src.services.llm_responses import generate_other_response
from tests.test_helpers import initial_state, with_user_message

_WELCOME = "Bienvenido a la agencia."


def _welcome_this_turn_state(message: str) -> dict:
    state = with_user_message(initial_state(), message)
    state["onboarding_greeting_done"] = True
    state["onboarding_welcome_sent_this_turn"] = True
    state["messages"] = list(state["messages"]) + [
        {"role": "assistant", "content": _WELCOME, "type": "AIMessage"}
    ]
    return state


class TestRouterOnboardingOther(unittest.TestCase):
    def test_welcome_this_turn_greeting_skips_second_message(self) -> None:
        state = _welcome_this_turn_state("Hola")
        with (
            patch("src.nodes.router.classify_router_intent") as mock_cls,
            patch("src.nodes.router.generate_other_response") as mock_other,
        ):
            out = router(dict(state))
        mock_cls.assert_not_called()
        mock_other.assert_not_called()
        self.assertEqual(out.get("intent"), "other")
        assistant = [m for m in out["messages"] if m.get("role") == "assistant"]
        self.assertEqual(len(assistant), 1)
        self.assertEqual(assistant[0]["content"], _WELCOME)

    def test_welcome_this_turn_thanks_gets_other_response(self) -> None:
        state = _welcome_this_turn_state("Gracias")
        with (
            patch("src.nodes.router.classify_router_intent", return_value="OTHER") as mock_cls,
            patch("src.nodes.router.generate_other_response", return_value="Con gusto.") as mock_other,
        ):
            out = router(dict(state))
        mock_cls.assert_called_once()
        mock_other.assert_called_once()
        self.assertEqual(mock_other.call_args[0][0], "Gracias")
        self.assertEqual(out.get("intent"), "other")
        self.assertEqual(out["messages"][-1]["content"], "Con gusto.")

    def test_welcome_this_turn_facebook_link_gets_other_response(self) -> None:
        link = "https://facebook.com/share/abc"
        state = _welcome_this_turn_state(link)
        with (
            patch("src.nodes.router.classify_router_intent", return_value="OTHER"),
            patch("src.nodes.router.generate_other_response", return_value="Recibi tu mensaje.") as mock_other,
        ):
            out = router(dict(state))
        mock_other.assert_called_once()
        self.assertEqual(mock_other.call_args[0][0], link)
        self.assertEqual(out["messages"][-1]["content"], "Recibi tu mensaje.")

    def test_later_greeting_calls_other_response(self) -> None:
        state = with_user_message(initial_state(), "Hola")
        state["onboarding_greeting_done"] = True
        state["onboarding_welcome_sent_this_turn"] = False
        with (
            patch("src.nodes.router.classify_router_intent", return_value="OTHER") as mock_cls,
            patch("src.nodes.router.generate_other_response", return_value="Hola, en que te ayudo?") as mock_other,
        ):
            out = router(dict(state))
        mock_cls.assert_called_once()
        mock_other.assert_called_once()
        self.assertEqual(mock_other.call_args[0][0], "Hola")
        self.assertEqual(out["messages"][-1]["content"], "Hola, en que te ayudo?")

    def test_welcome_this_turn_vehicle_catalog_still_routes(self) -> None:
        state = _welcome_this_turn_state("quiero ver el jimny")
        with patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"):
            out = router(dict(state))
        self.assertEqual(out.get("current_node"), "car_selection")
        self.assertEqual(out.get("intent"), "vehicle_catalog")
        self.assertFalse(out.get("onboarding_welcome_sent_this_turn"))


class TestGenerateOtherResponseGreetingShortcut(unittest.TestCase):
    def test_named_greeting_after_onboarding_uses_shortcut(self) -> None:
        with (
            patch("src.services.llm_responses.get_bot_settings", return_value={"welcomeMessage": _WELCOME}),
            patch("src.services.llm_responses.ChatOpenAI") as mock_llm,
        ):
            out = generate_other_response(
                "Hola",
                customer_name="Luis",
                onboarding_greeting_done=True,
            )
        mock_llm.assert_not_called()
        self.assertIn("Hola Luis", out)

    def test_thanks_with_known_name_does_not_use_greeting_shortcut(self) -> None:
        class _FakeLlm:
            def invoke(self, _prompt):
                class _Content:
                    content = "Con gusto, dime en que te ayudo."

                return _Content()

        with (
            patch("src.services.llm_responses.get_bot_settings", return_value={"welcomeMessage": _WELCOME}),
            patch("src.services.llm_responses.get_business_profile", return_value={}),
            patch("src.services.llm_responses.build_settings_block", return_value="CONFIG"),
            patch("src.services.llm_responses.ChatOpenAI", return_value=_FakeLlm()) as mock_llm,
        ):
            out = generate_other_response(
                "Gracias",
                customer_name="Luis",
                onboarding_greeting_done=True,
            )
        mock_llm.assert_called_once()
        self.assertEqual(out, "Con gusto, dime en que te ayudo.")
