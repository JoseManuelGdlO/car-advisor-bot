"""Tests para formateo de comparaciones (vehiculos, planes, promociones)."""

from __future__ import annotations

import unittest

from src.utils.formatters import (
    format_financing_plan_comparison,
    format_promotion_comparison,
    format_two_vehicle_comparison_grounding,
)


class TestFormatTwoVehicleComparisonGrounding(unittest.TestCase):
    def setUp(self) -> None:
        self.v1 = {
            "brand": "mazda",
            "model": "3",
            "year": 2020,
            "price": "350000",
            "km": 45000,
            "transmission": "automatica",
            "engine": "2.0",
            "color": "rojo",
            "status": "available",
            "description": "Unidad impecable",
        }
        self.v2 = {
            "brand": "honda",
            "model": "civic",
            "year": 2018,
            "price": "280000.50",
            "km": 62000,
            "transmission": "",
            "engine": "",
            "color": "",
            "status": "reserved",
            "description": "",
        }

    def test_web_has_both_sections_and_prices(self) -> None:
        out = format_two_vehicle_comparison_grounding(self.v1, self.v2, platform="web")
        self.assertIn("VEHICULO_A (", out)
        self.assertIn("VEHICULO_B (", out)
        self.assertIn("**Precio**", out)
        self.assertIn("$350,000.00", out)
        self.assertIn("$280,000.50", out)

    def test_whatsapp_uses_single_asterisk_bold(self) -> None:
        out = format_two_vehicle_comparison_grounding(self.v1, self.v2, platform="whatsapp")
        self.assertIn("*Marca*", out)
        self.assertNotIn("**Marca**", out)


class TestFormatFinancingPlanComparison(unittest.TestCase):
    def test_two_plans_row_structure(self) -> None:
        plan_a = {
            "name": "Plan A",
            "lender": "Banco X",
            "rate": "12.5",
            "showRate": True,
            "maxTermMonths": 48,
            "requirements": [{"title": "Identificacion"}],
            "vehicles": [{"brand": "nissan", "model": "versa", "year": 2020, "status": "available"}],
            "active": True,
        }
        plan_b = {
            "name": "Plan B",
            "lender": "Banco Y",
            "rate": "10",
            "showRate": True,
            "maxTermMonths": 60,
            "requirements": [],
            "vehicles": [],
            "active": True,
        }
        out = format_financing_plan_comparison(plan_a, plan_b, platform="web")
        self.assertIn("Plan A", out)
        self.assertIn("Plan B", out)
        self.assertIn("12.50%", out)
        self.assertIn("10.00%", out)


class TestFormatPromotionComparison(unittest.TestCase):
    def test_two_promos(self) -> None:
        a = {
            "title": "Promo A",
            "description": "Desc A",
            "validUntil": "2026-12-31",
            "vehicleLabels": ["Nissan Versa"],
            "active": True,
        }
        b = {
            "title": "Promo B",
            "description": "",
            "validUntil": "",
            "vehicleLabels": [],
            "active": True,
        }
        out = format_promotion_comparison(a, b, platform="web")
        self.assertIn("Promo A", out)
        self.assertIn("Promo B", out)
        self.assertIn("Desc A", out)


if __name__ == "__main__":
    unittest.main()
