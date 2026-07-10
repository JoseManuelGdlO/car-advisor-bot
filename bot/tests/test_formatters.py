"""Tests unitarios de `src.utils.formatters`: catálogo (nombres, listas) y comparaciones."""

from __future__ import annotations

import unittest

from src.utils.formatters import (
    format_available_vehicles_grouped,
    format_candidate_options,
    format_financing_plan_comparison,
    format_images_bulleted_list,
    format_promotion_comparison,
    format_two_vehicle_comparison_grounding,
    format_vehicle_detail,
    format_vehicle_name,
    sort_vehicles_by_outbound_priority,
)


class CarSelectionFormattersTests(unittest.TestCase):
    def test_sort_vehicles_by_outbound_priority_orders_asc_with_zero_last(self) -> None:
        vehicles = [
            {"brand": "Suzuki", "model": "Dzire", "outboundPriority": 2, "status": "available"},
            {"brand": "Suzuki", "model": "Swift", "outboundPriority": 1, "status": "available"},
            {"brand": "Suzuki", "model": "Jimny", "outboundPriority": 0, "status": "available"},
            {"brand": "Suzuki", "model": "Fronx", "outboundPriority": 3, "status": "available"},
        ]
        ordered = sort_vehicles_by_outbound_priority(vehicles)
        self.assertEqual([item["model"] for item in ordered], ["Swift", "Dzire", "Fronx", "Jimny"])

    def test_format_available_vehicles_grouped_respects_outbound_priority(self) -> None:
        vehicles = [
            {"brand": "suzuki", "model": "dzire", "year": 2026, "status": "available", "outboundPriority": 2},
            {"brand": "suzuki", "model": "swift", "year": 2026, "status": "available", "outboundPriority": 1},
            {"brand": "suzuki", "model": "fronx", "year": 2026, "status": "available", "outboundPriority": 3},
        ]
        output = format_available_vehicles_grouped(vehicles)
        self.assertIn("Swift, Dzire, Fronx", output)

    def test_format_vehicle_name_includes_year_when_available(self) -> None:
        self.assertEqual(format_vehicle_name({"brand": "Nissan", "model": "Versa", "year": 2011}), "Nissan Versa 2011")
        self.assertEqual(format_vehicle_name({"brand": "Nissan", "model": "Versa"}), "Nissan Versa")

    def test_format_candidate_options_returns_numbered_lines(self) -> None:
        options = format_candidate_options(
            [
                {"brand": "Nissan", "model": "Versa", "year": 2011},
                {"brand": "Dodge", "model": "Ram", "year": 2015},
            ]
        )
        self.assertEqual(options, "1. Nissan Versa 2011\n2. Dodge Ram 2015")

    def test_format_images_bulleted_list_uses_resolver(self) -> None:
        output = format_images_bulleted_list(
            ["/img/1.jpg", "/img/2.jpg"],
            resolve_url_fn=lambda url: f"https://api.test{url}",
        )
        self.assertEqual(
            output,
            "Imagenes del vehiculo:\n- https://api.test/img/1.jpg\n- https://api.test/img/2.jpg",
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

    def test_web_has_both_sections_with_price_and_without_color_by_default(self) -> None:
        out = format_two_vehicle_comparison_grounding(self.v1, self.v2, platform="web")
        self.assertIn("VEHICULO_A (", out)
        self.assertIn("VEHICULO_B (", out)
        self.assertIn("**Precio**", out)
        self.assertIn("$350,000.00", out)
        self.assertIn("$280,000.50", out)
        self.assertNotIn("**Color**", out)

    def test_web_includes_colors_when_requested(self) -> None:
        out = format_two_vehicle_comparison_grounding(
            self.v1,
            self.v2,
            platform="web",
            include_color=True,
        )
        self.assertIn("**Color**", out)
        self.assertIn("Rojo", out)

    def test_whatsapp_uses_single_asterisk_bold(self) -> None:
        out = format_two_vehicle_comparison_grounding(self.v1, self.v2, platform="whatsapp")
        self.assertIn("*Marca*", out)
        self.assertNotIn("**Marca**", out)


class TestFormatVehicleDetail(unittest.TestCase):
    def test_omits_color_by_default_and_includes_price(self) -> None:
        vehicle = {
            "brand": "Nissan",
            "model": "Versa",
            "year": 2011,
            "price": "350000",
            "km": 45000,
            "transmission": "automatica",
            "engine": "1.6",
            "color": "rojo",
            "description": "Unidad impecable",
        }
        out = format_vehicle_detail(vehicle, platform="web")
        self.assertIn("**Precio**", out)
        self.assertIn("$350,000.00", out)
        self.assertNotIn("**Color**", out)
        self.assertNotIn("Rojo", out)
        self.assertIn("**Marca**", out)

    def test_omits_description_when_empty(self) -> None:
        vehicle = {
            "brand": "Nissan",
            "model": "Versa",
            "year": 2011,
            "price": "350000",
            "km": 45000,
            "transmission": "automatica",
            "engine": "1.6",
            "description": "",
        }
        out = format_vehicle_detail(vehicle, platform="web")
        self.assertNotIn("**Descripción**", out)
        self.assertNotIn("Sin descripcion", out)

    def test_includes_description_when_present(self) -> None:
        vehicle = {
            "brand": "Nissan",
            "model": "Versa",
            "year": 2011,
            "price": "350000",
            "km": 45000,
            "transmission": "automatica",
            "engine": "1.6",
            "description": "Unidad impecable",
        }
        out = format_vehicle_detail(vehicle, platform="web")
        self.assertIn("**Descripción**", out)
        self.assertIn("Unidad impecable", out)

    def test_includes_color_when_requested(self) -> None:
        vehicle = {
            "brand": "Nissan",
            "model": "Versa",
            "year": 2011,
            "price": "350000",
            "km": 45000,
            "transmission": "automatica",
            "engine": "1.6",
            "color": "rojo",
            "description": "Unidad impecable",
        }
        out = format_vehicle_detail(vehicle, platform="web", include_color=True)
        self.assertIn("**Color**", out)
        self.assertIn("Rojo", out)


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
