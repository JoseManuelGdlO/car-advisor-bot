"""Tests para parseo bulk de contacto en lead_validators."""

from __future__ import annotations

import unittest

from src.utils.lead_validators import (
    is_valid_email,
    is_valid_full_name,
    is_valid_phone_digits,
    parse_contact_from_message,
)


class ParseContactFromMessageTests(unittest.TestCase):
    def test_full_message_comma_separated(self) -> None:
        parsed = parse_contact_from_message(
            "Ana Maria Gomez Lopez, 5512345678, ana@gmail.com"
        )
        self.assertEqual(parsed.get("nombre"), "Ana Maria Gomez Lopez")
        self.assertEqual(parsed.get("telefono"), "5512345678")
        self.assertEqual(parsed.get("email"), "ana@gmail.com")
        self.assertTrue(is_valid_full_name(parsed["nombre"]))
        self.assertTrue(is_valid_phone_digits(parsed["telefono"]))
        self.assertTrue(is_valid_email(parsed["email"]))

    def test_conversational_prefixes(self) -> None:
        parsed = parse_contact_from_message(
            "Mi nombre es Ana Maria Gomez Lopez, tel 55 1234 5678, correo ana@gmail.com"
        )
        self.assertEqual(parsed.get("nombre"), "Ana Maria Gomez Lopez")
        self.assertEqual(parsed.get("telefono"), "5512345678")
        self.assertEqual(parsed.get("email"), "ana@gmail.com")

    def test_partial_name_only(self) -> None:
        parsed = parse_contact_from_message("Ana Maria Gomez Lopez")
        self.assertEqual(parsed.get("nombre"), "Ana Maria Gomez Lopez")
        self.assertNotIn("telefono", parsed)
        self.assertNotIn("email", parsed)

    def test_partial_email_only(self) -> None:
        parsed = parse_contact_from_message("mi correo es ana@gmail.com")
        self.assertEqual(parsed.get("email"), "ana@gmail.com")
        self.assertNotIn("nombre", parsed)

    def test_short_name_not_valid_full_name(self) -> None:
        parsed = parse_contact_from_message("A B, 5512345678, j@mail.com")
        self.assertIn("nombre", parsed)
        self.assertFalse(is_valid_full_name(parsed["nombre"]))


if __name__ == "__main__":
    unittest.main()
