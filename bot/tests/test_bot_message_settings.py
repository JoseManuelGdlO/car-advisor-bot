"""Tests de settings de identidad y mensajes predefinidos del bot."""

from __future__ import annotations

import unittest

from src.services.llm_responses import strip_name_request_from_welcome_message
from src.utils.prompts import (
    append_bot_message_templates_to_verified_block,
    build_bot_message_templates_block,
    build_faq_interrupt_flags_prompt,
    build_settings_block,
)


class BotMessageSettingsTests(unittest.TestCase):
    def test_build_settings_block_includes_bot_name_only_when_present(self) -> None:
        without_name = build_settings_block({"tone": "cercano", "emojiStyle": "pocos", "salesProactivity": "medio"})
        self.assertNotIn("Te presentas al usuario como", without_name)

        with_name = build_settings_block(
            {
                "tone": "cercano",
                "emojiStyle": "pocos",
                "salesProactivity": "medio",
                "botName": "AutoBot",
            }
        )
        self.assertIn("Te presentas al usuario como: AutoBot", with_name)

    def test_build_bot_message_templates_block_empty_without_messages(self) -> None:
        self.assertEqual(build_bot_message_templates_block({}), "")
        self.assertEqual(
            build_bot_message_templates_block({"welcomeMessage": "", "faqFallbackMessage": None}),
            "",
        )

    def test_build_bot_message_templates_block_includes_configured_messages(self) -> None:
        block = build_bot_message_templates_block(
            {
                "welcomeMessage": "Hola, bienvenido",
                "faqFallbackMessage": "No tengo esa info",
            }
        )
        self.assertIn("MENSAJES_PREDEFINIDOS_VERIFICADOS", block)
        self.assertIn("mensaje_bienvenida_literal: Hola, bienvenido", block)
        self.assertIn("mensaje_fallback_faq_literal: No tengo esa info", block)

    def test_append_bot_message_templates_preserves_existing_facts(self) -> None:
        settings = {"faqFallbackMessage": "Consulta con un asesor humano."}
        merged = append_bot_message_templates_to_verified_block("situacion: sin faq\n", settings)
        self.assertIn("situacion: sin faq", merged)
        self.assertIn("mensaje_fallback_faq_literal: Consulta con un asesor humano.", merged)

    def test_strip_name_request_from_welcome_message(self) -> None:
        raw = "Hola buen día, en qué te puedo ayudar, con quién tengo el gusto?"
        self.assertEqual(
            strip_name_request_from_welcome_message(raw),
            "Hola buen día, en qué te puedo ayudar",
        )

    def test_faq_interrupt_prompt_rejects_name_as_human_advisor(self) -> None:
        prompt = build_faq_interrupt_flags_prompt(
            current_node="customer_onboarding",
            last_bot_message="Mucho gusto, Javier.",
            user_message="Con Javier",
            awaiting_purchase_confirmation=False,
            pending_vehicle_count=0,
            bot_settings=None,
        )
        self.assertIn("Con Javier", prompt)
        self.assertIn("quiere_asesor_humano: false", prompt)
        self.assertIn("la preposicion 'con' + nombre NO significa pedir un asesor", prompt)


if __name__ == "__main__":
    unittest.main()
