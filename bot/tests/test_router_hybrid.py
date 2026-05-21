from __future__ import annotations

import unittest
from unittest.mock import patch

from src.nodes.router import router
from tests.test_helpers import initial_state, with_user_message


class TestRouterHybrid(unittest.TestCase):
    def test_unknown_llm_falls_back_to_location_heuristic_faq(self) -> None:
        state = with_user_message(initial_state(), "donde se encuentran ubicados?")
        with patch("src.nodes.router.classify_router_intent", return_value="UNKNOWN"):
            out = router(dict(state))
        self.assertEqual(out.get("current_node"), "faq")
        self.assertEqual(out.get("intent"), "faq")

    def test_llm_faq_overridden_by_financing_heuristic(self) -> None:
        state = with_user_message(initial_state(), "ofrecen planes flexibles con mensual fija")
        with patch("src.nodes.router.classify_router_intent", return_value="FAQ"):
            out = router(dict(state))
        self.assertEqual(out.get("current_node"), "financing")
        self.assertEqual(out.get("intent"), "financing")

    def test_interesa_does_not_trigger_financing_signal(self) -> None:
        state = with_user_message(initial_state(), "Me interesa el corolla, que año es?")
        with patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"):
            out = router(dict(state))
        self.assertNotEqual(out.get("current_node"), "financing")
        self.assertNotEqual(out.get("intent"), "financing")

    def test_classifier_receives_sanitized_intent_after_faq(self) -> None:
        state = with_user_message(initial_state(), "cualquier cosa ambigua")
        state["intent"] = "faq"
        with patch("src.nodes.router.classify_router_intent") as mock_cls:
            mock_cls.return_value = "VEHICLE_CATALOG"
            router(dict(state))
        mock_cls.assert_called_once()
        args, _kwargs = mock_cls.call_args
        self.assertEqual(args[1], "other")
