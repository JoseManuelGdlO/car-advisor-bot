"""Tests del atajo CTWA hacia car_selection."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from src.nodes.customer_onboarding import customer_onboarding
from src.utils.ad_campaign_shortcut import (
    ad_matching_text,
    apply_ad_campaign_shortcut,
    can_apply_ad_campaign_shortcut,
)
from tests.test_helpers import GraphTestCase, initial_state, with_user_message

_AD_CONTEXT = {
    "isAd": True,
    "title": "Nissan Versa 2020",
    "body": "Vacaciones con Versa",
    "greetingMessageBody": None,
}

_VEHICLE = {
    "id": "veh-1",
    "brand": "Nissan",
    "model": "Versa",
    "year": 2020,
    "status": "available",
}


class AdCampaignShortcutUnitTests(unittest.TestCase):
    def test_ad_matching_text_concatenates_title_body_greeting(self) -> None:
        text = ad_matching_text(
            {
                "isAd": True,
                "title": "Nissan Versa 2020",
                "body": "Listo para entregar",
                "greetingMessageBody": "Hola! Quiero más información",
            }
        )
        self.assertIn("Nissan Versa 2020", text)
        self.assertIn("Listo para entregar", text)
        self.assertIn("Hola! Quiero más información", text)

    def test_ad_matching_text_empty_without_is_ad(self) -> None:
        self.assertEqual(ad_matching_text({"title": "Nissan Versa"}), "")
        self.assertEqual(ad_matching_text(None), "")

    def test_apply_shortcut_sets_car_selection_flags(self) -> None:
        state = initial_state()
        state["onboarding_greeting_done"] = False
        with patch(
            "src.utils.ad_campaign_shortcut.resolve_single_vehicle_from_text",
            return_value=_VEHICLE,
        ):
            applied = apply_ad_campaign_shortcut(state, dict(_AD_CONTEXT))
        self.assertTrue(applied)
        self.assertTrue(state.get("ad_campaign_shortcut"))
        self.assertTrue(state.get("ad_campaign_shortcut_applied"))
        self.assertEqual(state.get("selected_vehicle_id"), "veh-1")
        self.assertEqual(state.get("selected_car"), "Nissan Versa 2020")
        self.assertEqual(state.get("current_node"), "car_selection")
        self.assertTrue(state.get("show_selected_vehicle_detail_once"))
        self.assertTrue(state.get("onboarding_greeting_done"))
        self.assertFalse(state.get("awaiting_customer_name"))

    def test_apply_shortcut_skips_without_match(self) -> None:
        state = initial_state()
        with patch(
            "src.utils.ad_campaign_shortcut.resolve_single_vehicle_from_text",
            return_value=None,
        ):
            applied = apply_ad_campaign_shortcut(
                state,
                {"isAd": True, "title": "Modelo inventado", "body": "sin stock"},
            )
        self.assertFalse(applied)
        self.assertFalse(state.get("ad_campaign_shortcut"))
        self.assertFalse(state.get("ad_campaign_shortcut_applied"))
        self.assertEqual(state.get("selected_vehicle_id"), "")

    def test_apply_shortcut_skips_when_already_applied(self) -> None:
        state = initial_state()
        state["ad_campaign_shortcut_applied"] = True
        with patch(
            "src.utils.ad_campaign_shortcut.resolve_single_vehicle_from_text",
            return_value=_VEHICLE,
        ) as resolve_mock:
            applied = apply_ad_campaign_shortcut(state, dict(_AD_CONTEXT))
        self.assertFalse(applied)
        resolve_mock.assert_not_called()
        self.assertEqual(state.get("selected_vehicle_id"), "")

    def test_apply_shortcut_skips_mid_session_car_selection(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["selected_vehicle_id"] = "veh-other"
        with patch(
            "src.utils.ad_campaign_shortcut.resolve_single_vehicle_from_text",
            return_value=_VEHICLE,
        ) as resolve_mock:
            applied = apply_ad_campaign_shortcut(state, dict(_AD_CONTEXT))
        self.assertFalse(applied)
        resolve_mock.assert_not_called()
        self.assertEqual(state.get("selected_vehicle_id"), "veh-other")

    def test_can_apply_false_when_awaiting_purchase_confirmation(self) -> None:
        state = initial_state()
        state["awaiting_purchase_confirmation"] = True
        self.assertFalse(can_apply_ad_campaign_shortcut(state))


class AdCampaignOnboardingTests(unittest.TestCase):
    def test_onboarding_skips_name_capture_for_ad_shortcut(self) -> None:
        state = with_user_message(initial_state(), "Hola! Quiero más información")
        state["customer_info"] = {}
        state["onboarding_greeting_done"] = False
        state["ad_campaign_shortcut"] = True
        state["selected_vehicle_id"] = "veh-1"
        state["selected_car"] = "Nissan Versa 2020"
        state["current_node"] = "car_selection"
        state["show_selected_vehicle_detail_once"] = True

        updated = customer_onboarding(state)

        self.assertFalse(updated.get("onboarding_turn_complete"))
        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertTrue(updated.get("onboarding_greeting_done"))
        self.assertFalse(updated.get("awaiting_customer_name"))
        assistant_msgs = [m for m in updated.get("messages", []) if m.get("role") == "assistant"]
        self.assertEqual(assistant_msgs, [])


class AdCampaignGraphFlowTests(GraphTestCase):
    def test_graph_skips_onboarding_and_shows_vehicle_detail(self) -> None:
        state = with_user_message(initial_state(), "Hola! Quiero más información")
        state["customer_info"] = {}
        state["onboarding_greeting_done"] = False
        state["ad_campaign_shortcut"] = True
        state["selected_vehicle_id"] = "veh-1"
        state["selected_car"] = "Nissan Versa 2020"
        state["intent"] = "vehicle_catalog"
        state["current_node"] = "car_selection"
        state["show_selected_vehicle_detail_once"] = True

        vehicle_detail = {
            "id": "veh-1",
            "brand": "Nissan",
            "model": "Versa",
            "year": 2020,
            "price": 180000,
            "status": "available",
            "color": "blanco",
            "mileage": 40000,
            "transmission": "automatico",
            "images": [],
        }

        with (
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[vehicle_detail]),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=vehicle_detail),
            patch(
                "src.nodes.car_selection.generate_vehicle_detail_conversation",
                return_value="Detalle del Nissan Versa 2020 desde anuncio.",
            ),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertFalse(updated.get("awaiting_customer_name"))
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        assistant_texts = [
            str(m.get("content", ""))
            for m in updated.get("messages", [])
            if m.get("role") == "assistant"
        ]
        self.assertTrue(
            any("Nissan Versa 2020" in t for t in assistant_texts),
            msg="debe responder con detalle del vehiculo del anuncio",
        )
        joined = "\n".join(assistant_texts).lower()
        self.assertNotIn("como te llamas", joined)
        self.assertNotIn("¿cómo te llamas", joined)


if __name__ == "__main__":
    unittest.main()
