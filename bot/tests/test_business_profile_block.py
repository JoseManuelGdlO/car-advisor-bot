from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from src.utils.prompts import (
    append_business_profile_to_verified_block,
    build_business_profile_block,
)


class TestBusinessProfileBlock(unittest.TestCase):
    def test_empty_profile_returns_empty_block(self) -> None:
        self.assertEqual(build_business_profile_block(None), "")
        self.assertEqual(build_business_profile_block({}), "")

    def test_formats_only_non_empty_fields(self) -> None:
        block = build_business_profile_block(
            {
                "tradeName": "Auto Lote MX",
                "legalName": "Auto Lote MX SA de CV",
                "taxId": "RFC123456789",
                "addressLine": "Av. Reforma 123",
                "city": "CDMX",
                "description": "Venta de autos seminuevos.",
            }
        )
        self.assertIn("PERFIL_NEGOCIO_VERIFICADO:", block)
        self.assertIn("nombre_comercial: Auto Lote MX", block)
        self.assertIn("direccion: Av. Reforma 123", block)
        self.assertIn("ciudad: CDMX", block)
        self.assertIn("descripcion_negocio: Venta de autos seminuevos.", block)
        self.assertNotIn("razon_social:", block)
        self.assertNotIn("nit_id_fiscal:", block)
        self.assertNotIn("RFC123456789", block)

    def test_append_preserves_existing_facts(self) -> None:
        enriched = append_business_profile_to_verified_block(
            "operacion: catalogo\nexito: true",
            {"tradeName": "Lote Norte"},
        )
        self.assertTrue(enriched.startswith("operacion: catalogo"))
        self.assertIn("PERFIL_NEGOCIO_VERIFICADO:", enriched)
        self.assertIn("nombre_comercial: Lote Norte", enriched)

    def test_append_without_profile_is_noop(self) -> None:
        facts = "BASE_FAQ_DESDE_BD:\nP: horario\nR: 9 a 6"
        self.assertEqual(append_business_profile_to_verified_block(facts, {}), facts)


class TestVerifiedMessageEnrichment(unittest.TestCase):
    @patch("src.services.llm_responses.get_business_profile")
    @patch("src.services.llm_responses.get_bot_settings")
    @patch("src.services.llm_responses.ChatOpenAI")
    def test_generate_verified_user_message_injects_business_profile(
        self,
        mock_chat: MagicMock,
        mock_settings: MagicMock,
        mock_profile: MagicMock,
    ) -> None:
        from src.services.llm_responses import generate_verified_user_message

        mock_settings.return_value = {"tone": "cercano", "emojiStyle": "frecuentes", "salesProactivity": "bajo"}
        mock_profile.return_value = {"tradeName": "Agencia Demo", "businessPhone": "+525512345678"}
        mock_chat.return_value.invoke.return_value = MagicMock(content="Estamos en Av. Demo 10.")

        out = generate_verified_user_message(
            mode="faq_turn",
            verified_facts_block="BASE_FAQ_DESDE_BD:\n(sin match)",
            user_message="¿Dónde están ubicados?",
            fallback="fallback",
            temperature=0.2,
        )
        self.assertEqual(out, "Estamos en Av. Demo 10.")
        prompt = mock_chat.return_value.invoke.call_args[0][0]
        self.assertIn("PERFIL_NEGOCIO_VERIFICADO:", prompt)
        self.assertIn("nombre_comercial: Agencia Demo", prompt)
        self.assertIn("telefono_negocio: +525512345678", prompt)


if __name__ == "__main__":
    unittest.main()
