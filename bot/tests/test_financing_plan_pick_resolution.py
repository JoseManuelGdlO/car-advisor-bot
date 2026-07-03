"""Resolucion de plan de financiamiento por extractor JSON."""

from __future__ import annotations

import unittest

from src.nodes.financing import _resolve_plan_from_extract


class TestFinancingPlanPickResolution(unittest.TestCase):
    def setUp(self) -> None:
        self.candidates = [
            {
                "id": "plan-baleno",
                "name": "Financiamiento Baleno",
                "lender": "BBVA",
                "active": True,
                "vehicles": [
                    {
                        "id": "veh-baleno",
                        "brand": "Suzuki",
                        "model": "Baleno",
                        "year": 2025,
                        "status": "available",
                    }
                ],
            },
            {
                "id": "plan-jimny",
                "name": "Financiamiento Jimny 5 Puertas",
                "lender": "Santander",
                "active": True,
                "vehicles": [
                    {
                        "id": "veh-jimny",
                        "brand": "Suzuki",
                        "model": "Jimny 5 Puertas",
                        "year": 2025,
                        "status": "available",
                    }
                ],
            },
        ]

    def test_resolve_from_extract_index(self) -> None:
        resolved = _resolve_plan_from_extract(
            self.candidates,
            {"no_match": False, "plan_index": 2, "name_query": ""},
        )
        self.assertIsNotNone(resolved)
        assert resolved is not None
        self.assertEqual(resolved.get("id"), "plan-jimny")

    def test_resolve_from_extract_name_query_partial(self) -> None:
        resolved = _resolve_plan_from_extract(
            self.candidates,
            {"no_match": False, "plan_index": None, "name_query": "jimny 5p"},
        )
        self.assertIsNotNone(resolved)
        assert resolved is not None
        self.assertEqual(resolved.get("id"), "plan-jimny")

    def test_no_match_skips(self) -> None:
        self.assertIsNone(
            _resolve_plan_from_extract(
                self.candidates,
                {"no_match": True, "plan_index": 1, "name_query": "jimny"},
            ),
        )

    def test_ambiguous_substring_query_falls_through_to_token_match(self) -> None:
        """Consultas que coinciden por substring en varios planes no eligen el primero."""
        self.assertIsNone(
            _resolve_plan_from_extract(
                self.candidates,
                {"no_match": False, "plan_index": None, "name_query": "suzuki"},
            ),
        )
        self.assertIsNone(
            _resolve_plan_from_extract(
                self.candidates,
                {"no_match": False, "plan_index": None, "name_query": "financiamiento"},
            ),
        )

    def test_substring_unique_match_skips_token_stage(self) -> None:
        resolved = _resolve_plan_from_extract(
            self.candidates,
            {"no_match": False, "plan_index": None, "name_query": "bbva"},
        )
        self.assertIsNotNone(resolved)
        assert resolved is not None
        self.assertEqual(resolved.get("id"), "plan-baleno")


if __name__ == "__main__":
    unittest.main()
