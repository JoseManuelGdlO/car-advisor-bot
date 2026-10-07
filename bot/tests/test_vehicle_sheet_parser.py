"""Lectura estructurada de fichas técnicas."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from src.services.llm_responses import parse_vehicle_sheet_text


class ParseVehicleSheetTextTests(unittest.TestCase):
    def test_empty_text_skips_the_model(self) -> None:
        with patch("src.services.llm_responses.ChatOpenAI") as mocked_chat:
            result = parse_vehicle_sheet_text("   ")

        mocked_chat.assert_not_called()
        self.assertIsNone(result["brand"])
        self.assertIsNone(result["price"])
        self.assertEqual(result["metadata"], {})

    def test_returns_json_and_drops_price_missing_from_the_sheet(self) -> None:
        sheet = "Marca: Nissan\nModelo: Versa\nAño: 2024\nMotor: 1.6L\nColor: Gris"
        with patch("src.services.llm_responses.ChatOpenAI") as mocked_chat:
            mocked_chat.return_value.invoke.return_value.content = (
                '{"brand":"Nissan","model":"Versa","year":2024,"price":450000,'
                '"km":0,"transmission":"CVT","engine":"1.6L","color":"Gris",'
                '"description":"Sedán compacto","metadata":{"passengers":5}}'
            )
            result = parse_vehicle_sheet_text(sheet)

        mocked_chat.assert_called_once()
        self.assertEqual(mocked_chat.call_args.kwargs["temperature"], 0)
        self.assertEqual(result["brand"], "Nissan")
        self.assertEqual(result["model"], "Versa")
        self.assertEqual(result["year"], 2024)
        self.assertIsNone(result["price"])
        self.assertEqual(result["engine"], "1.6L")
        self.assertEqual(result["metadata"], {"passengers": 5})

    def test_keeps_price_when_the_digits_are_in_the_sheet(self) -> None:
        sheet = "Volkswagen Tiguan 2024. Precio de lista $629,900."
        with patch("src.services.llm_responses.ChatOpenAI") as mocked_chat:
            mocked_chat.return_value.invoke.return_value.content = '{"brand":"Volkswagen","price":629900}'
            result = parse_vehicle_sheet_text(sheet)

        self.assertEqual(result["price"], 629900)
        self.assertEqual(result["brand"], "Volkswagen")


if __name__ == "__main__":
    unittest.main()
