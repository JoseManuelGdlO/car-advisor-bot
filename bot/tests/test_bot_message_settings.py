"""Tests de settings de identidad y mensajes predefinidos del bot."""

from __future__ import annotations

import unittest

from src.utils.prompts import (
    append_bot_message_templates_to_verified_block,
    build_bot_message_templates_block,
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


if __name__ == "__main__":
    unittest.main()
