from __future__ import annotations

import unittest
from unittest.mock import patch

from src.nodes.router import router
from tests.test_helpers import initial_state, with_user_message


class TestRouterHybrid(unittest.TestCase):
    def test_unknown_llm_falls_back_to_other(self) -> None:
        state = with_user_message(initial_state(), "donde se encuentran ubicados?")
        with (
            patch("src.nodes.router.classify_router_intent", return_value="UNKNOWN"),
            patch("src.nodes.router.generate_other_response", return_value="Te ayudo en un momento."),
        ):
            out = router(dict(state))
        self.assertEqual(out.get("intent"), "other")
        self.assertIn("Te ayudo en un momento.", out["messages"][-1]["content"])

    def test_llm_faq_routes_to_faq(self) -> None:
        state = with_user_message(initial_state(), "ofrecen planes flexibles con mensual fija")
        with patch("src.nodes.router.classify_router_intent", return_value="FAQ"):
            out = router(dict(state))
        self.assertEqual(out.get("current_node"), "faq")
        self.assertEqual(out.get("intent"), "faq")

    def test_hours_question_routes_via_llm_classifier(self) -> None:
        state = with_user_message(initial_state(), "si quiero saber el horario que manejan")
        with patch("src.nodes.router.classify_router_intent", return_value="FAQ"):
            out = router(dict(state))
        self.assertEqual(out.get("current_node"), "faq")
        self.assertEqual(out.get("intent"), "faq")

    def test_vehicle_catalog_via_llm_classifier(self) -> None:
        state = with_user_message(initial_state(), "Me interesa el corolla, que año es?")
        with patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"):
            out = router(dict(state))
        self.assertEqual(out.get("current_node"), "car_selection")
        self.assertEqual(out.get("intent"), "vehicle_catalog")

    def test_classifier_receives_sanitized_intent_after_faq(self) -> None:
        state = with_user_message(initial_state(), "cualquier cosa ambigua")
        state["intent"] = "faq"
        with patch("src.nodes.router.classify_router_intent") as mock_cls:
            mock_cls.return_value = "VEHICLE_CATALOG"
            router(dict(state))
        mock_cls.assert_called_once()
        args, _kwargs = mock_cls.call_args
        self.assertEqual(args[1], "other")

    def test_jimny_info_question_routes_via_llm_not_faq_heuristic(self) -> None:
        state = with_user_message(
            initial_state(),
            "Me puedes dar informacion del jimny de 5 puertas?",
        )
        with patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"):
            out = router(dict(state))
        self.assertEqual(out.get("current_node"), "car_selection")
        self.assertEqual(out.get("intent"), "vehicle_catalog")
