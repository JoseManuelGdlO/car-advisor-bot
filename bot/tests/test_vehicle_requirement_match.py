"""Unit tests del matching semántico por description/metadata."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from src.services.llm_responses import classify_vehicle_requirement_matches
from src.tools.vehicles import build_vehicle_requirement_catalog_block


class VehicleRequirementCatalogBlockTests(unittest.TestCase):
    def test_includes_description_and_passengers_metadata(self) -> None:
        block = build_vehicle_requirement_catalog_block(
            [
                {
                    "id": "veh-1",
                    "brand": "Suzuki",
                    "model": "Swift",
                    "year": 2026,
                    "status": "available",
                    "price": 299900,
                    "description": "Ideal para uber",
                    "metadata": {"passengers": 5, "doors": 4},
                    "transmission": "Automatica",
                }
            ]
        )
        self.assertIn("id=veh-1", block)
        self.assertIn("Ideal para uber", block)
        self.assertIn("passengers=5", block)
        self.assertIn("doors=4", block)
        self.assertIn("transmission=Automatica", block)
        self.assertIn("price=299900", block)

    def test_price_missing_renders_nd(self) -> None:
        block = build_vehicle_requirement_catalog_block(
            [{"id": "veh-2", "brand": "Nissan", "model": "Versa", "status": "available"}]
        )
        self.assertIn("price=N/D", block)


class ClassifyVehicleRequirementMatchesTests(unittest.TestCase):
    def test_resolves_only_known_ids(self) -> None:
        vehicles = [
            {"id": "veh-a", "brand": "Suzuki", "model": "Swift", "year": 2026, "status": "available"},
            {"id": "veh-b", "brand": "Suzuki", "model": "Jimny", "year": 2027, "status": "available"},
        ]
        with patch("src.services.llm_responses.ChatOpenAI") as mocked_chat:
            mocked_chat.return_value.invoke.return_value.content = (
                '{"is_requirement_search": true, '
                '"matched_vehicle_ids": ["veh-a", "veh-missing", "veh-a"], '
                '"criterion_summary": "plataforma"}'
            )
            result = classify_vehicle_requirement_matches("tienes carros para plataforma?", vehicles)

        self.assertTrue(result["is_requirement_search"])
        self.assertEqual(result["criterion_summary"], "plataforma")
        self.assertEqual([item["id"] for item in result["matched_vehicles"]], ["veh-a"])

    def test_false_requirement_clears_matches(self) -> None:
        vehicles = [{"id": "veh-a", "brand": "Suzuki", "model": "Swift", "year": 2026, "status": "available"}]
        with patch("src.services.llm_responses.ChatOpenAI") as mocked_chat:
            mocked_chat.return_value.invoke.return_value.content = (
                '{"is_requirement_search": false, '
                '"matched_vehicle_ids": ["veh-a"], '
                '"criterion_summary": "no aplica"}'
            )
            result = classify_vehicle_requirement_matches("que carros tienes", vehicles)

        self.assertFalse(result["is_requirement_search"])
        self.assertEqual(result["matched_vehicles"], [])
        self.assertEqual(result["criterion_summary"], "")


if __name__ == "__main__":
    unittest.main()
