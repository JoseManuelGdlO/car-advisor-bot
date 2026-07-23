from __future__ import annotations

import unittest
from unittest.mock import patch

from src.nodes.faq import is_faq_hours_topic, resolve_faq_follow_up
from src.services.llm_responses import generate_faq_user_turn
from src.utils.purchase_flow_messages import (
    CONTACT_PREFERENCE_MESSAGE,
    FAQ_SOFT_CATALOG_CLOSE,
    PURCHASE_PREFERENCES_REASK_BOTH,
)


class FaqFollowUpTests(unittest.TestCase):
    def test_hours_question_detected_from_user_text(self) -> None:
        self.assertTrue(is_faq_hours_topic("¿Cuál es su horario de atención?", []))

    def test_hours_question_detected_from_faq_context(self) -> None:
        self.assertTrue(
            is_faq_hours_topic(
                "información del negocio",
                ["P: horarios\nR: Lunes a viernes de 9:00 a 18:00."],
            )
        )

    def test_location_question_standalone_has_no_close(self) -> None:
        close, topic = resolve_faq_follow_up("¿Dónde están ubicados?", ["Ubicación: Centro."])
        self.assertEqual(topic, "ubicacion")
        self.assertEqual(close, "")
        self.assertNotIn("agendar", close.lower())

    def test_non_hours_non_location_uses_soft_catalog_close(self) -> None:
        close, topic = resolve_faq_follow_up(
            "¿Qué garantía ofrecen?",
            ["Garantía de 1 año en motor."],
        )
        self.assertEqual(topic, "general")
        self.assertEqual(close, FAQ_SOFT_CATALOG_CLOSE)
        self.assertNotIn("cita", close.lower())

    def test_hours_question_standalone_has_no_close(self) -> None:
        close, topic = resolve_faq_follow_up(
            "¿A qué hora abren?",
            ["P: horarios\nR: Abrimos de 9 a 6."],
        )
        self.assertEqual(topic, "horarios")
        self.assertEqual(close, "")
        self.assertNotIn("carro", close.lower())

    def test_hours_mid_purchase_contact_uses_contact_preference(self) -> None:
        close, topic = resolve_faq_follow_up(
            "¿A qué hora abren?",
            ["P: horarios\nR: Abrimos de 9 a 6."],
            state={
                "selected_car": "Toyota Corolla",
                "awaiting_purchase_confirmation": True,
            },
        )
        self.assertEqual(topic, "horarios")
        self.assertEqual(close, CONTACT_PREFERENCE_MESSAGE)

    def test_location_mid_purchase_prefs_uses_preferences_reask(self) -> None:
        close, topic = resolve_faq_follow_up(
            "¿Dónde están?",
            ["Ubicación: Centro."],
            state={"awaiting_purchase_preferences": True},
        )
        self.assertEqual(topic, "ubicacion")
        self.assertEqual(close, PURCHASE_PREFERENCES_REASK_BOTH)

    @patch("src.services.llm_responses.generate_verified_user_message")
    @patch("src.services.llm_responses.generate_grounded_answer", return_value="Abrimos de 9 a 18 h.")
    def test_generate_faq_user_turn_passes_hours_topic_to_verified_block(
        self,
        _mock_grounded,
        mock_verified,
    ) -> None:
        mock_verified.return_value = "Abrimos de 9 a 18 h."
        generate_faq_user_turn(
            user_question="¿Cuál es su horario?",
            faq_candidates=["P: horarios\nR: 9 a 18 h."],
            close_literal="",
            faq_close_topic="horarios",
        )
        facts = mock_verified.call_args.kwargs["verified_facts_block"]
        self.assertIn("tema_faq_cierre: horarios", facts)
        self.assertIn("cierre_literal: (ninguno)", facts)


if __name__ == "__main__":
    unittest.main()
