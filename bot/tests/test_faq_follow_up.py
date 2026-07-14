from __future__ import annotations

import unittest
from unittest.mock import patch

from src.nodes.faq import is_faq_hours_topic, resolve_faq_follow_up
from src.services.llm_responses import generate_faq_user_turn


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

    def test_location_question_uses_schedule_close(self) -> None:
        close, topic = resolve_faq_follow_up("¿Dónde están ubicados?", ["Ubicación: Centro."])
        self.assertEqual(topic, "ubicacion")
        self.assertIn("agendar una cita", close.lower())
        self.assertNotIn("algo más", close.lower())

    def test_non_hours_non_location_uses_default_close(self) -> None:
        close, topic = resolve_faq_follow_up(
            "¿Qué garantía ofrecen?",
            ["Garantía de 1 año en motor."],
        )
        self.assertEqual(topic, "general")
        self.assertIn("algo más", close.lower())

    def test_hours_question_uses_schedule_close(self) -> None:
        close, topic = resolve_faq_follow_up(
            "¿A qué hora abren?",
            ["P: horarios\nR: Abrimos de 9 a 6."],
        )
        self.assertEqual(topic, "horarios")
        self.assertIn("agendar una cita", close.lower())
        self.assertNotIn("carro", close.lower())

    @patch("src.services.llm_responses.generate_verified_user_message")
    @patch("src.services.llm_responses.generate_grounded_answer", return_value="Abrimos de 9 a 18 h.")
    def test_generate_faq_user_turn_passes_hours_topic_to_verified_block(
        self,
        _mock_grounded,
        mock_verified,
    ) -> None:
        mock_verified.return_value = "Abrimos de 9 a 18 h. ¿Te gustaría agendar una cita?"
        generate_faq_user_turn(
            user_question="¿Cuál es su horario?",
            faq_candidates=["P: horarios\nR: 9 a 18 h."],
            close_literal="¿Te gustaría agendar una cita?",
            faq_close_topic="horarios",
        )
        facts = mock_verified.call_args.kwargs["verified_facts_block"]
        self.assertIn("tema_faq_cierre: horarios", facts)
        self.assertIn("cierre_literal: ¿Te gustaría agendar una cita?", facts)


if __name__ == "__main__":
    unittest.main()
