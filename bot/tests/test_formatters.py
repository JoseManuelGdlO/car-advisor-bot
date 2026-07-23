"""Tests unitarios de `src.utils.formatters`: catálogo (nombres, listas) y comparaciones."""

from __future__ import annotations

import unittest

from src.utils.formatters import (
    assemble_vehicle_detail_pitch,
    format_available_vehicles_grouped,
    format_candidate_options,
    format_financing_plan_comparison,
    format_financing_plans,
    format_financing_plans_for_vehicle,
    format_images_bulleted_list,
    format_promotion_comparison,
    format_two_vehicle_comparison_grounding,
    format_vehicle_detail,
    format_vehicle_detail_pitch,
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
        # Una sola marca: no se menciona el nombre; un modelo por linea.
        self.assertEqual(output, "🚗 Swift 2026\n🚗 Dzire 2026\n🚗 Fronx 2026")

    def test_format_available_vehicles_grouped_shows_brand_when_multiple(self) -> None:
        vehicles = [
            {"brand": "suzuki", "model": "swift", "year": 2026, "status": "available", "outboundPriority": 1},
            {"brand": "nissan", "model": "versa", "year": 2011, "status": "available", "outboundPriority": 2},
        ]
        output = format_available_vehicles_grouped(vehicles)
        self.assertEqual(output, "🚗 Suzuki:\n• Swift 2026\n🚗 Nissan:\n• Versa 2011")

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
        self.assertIn("a partir de $350,000.00", out)
        self.assertIn("a partir de $280,000.50", out)
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
        self.assertIn("a partir de $350,000.00", out)
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

    def test_omits_metadata_when_empty_or_missing(self) -> None:
        vehicle = {
            "brand": "Nissan",
            "model": "Versa",
            "year": 2011,
            "price": "350000",
            "km": 45000,
            "transmission": "automatica",
            "engine": "1.6",
            "description": "Unidad impecable",
            "metadata": {},
        }
        out = format_vehicle_detail(vehicle, platform="web")
        self.assertIn("**Descripción**", out)
        self.assertNotIn("Longitud", out)
        out_missing = format_vehicle_detail({**vehicle, "metadata": None}, platform="web")
        self.assertIn("**Descripción**", out_missing)

    def test_includes_mapped_dimensions_from_metadata(self) -> None:
        vehicle = {
            "brand": "Suzuki",
            "model": "Dzire",
            "year": 2026,
            "price": "312990",
            "km": 0,
            "transmission": "manual",
            "engine": "1.2",
            "description": "Sedan eficiente",
            "metadata": {
                "lengthMm": 3995,
                "widthMm": 1735,
                "heightMm": 1515,
                "wheelbaseMm": 2450,
                "passengers": 5,
            },
        }
        out = format_vehicle_detail(vehicle, platform="web")
        self.assertIn("**Descripción**: Sedan eficiente", out)
        self.assertNotIn("**Longitud total**", out)
        self.assertNotIn("**Ancho total**", out)
        self.assertNotIn("**Altura total**", out)
        self.assertNotIn("**Distancia entre ejes**", out)
        self.assertIn("**Pasajeros**: 5", out)

        out_with_dims = format_vehicle_detail(vehicle, platform="web", include_dimensions=True)
        self.assertIn("**Longitud total**: 3995", out_with_dims)
        self.assertIn("**Ancho total**: 1735", out_with_dims)
        self.assertIn("**Altura total**: 1515", out_with_dims)
        self.assertIn("**Distancia entre ejes**: 2450", out_with_dims)
        self.assertIn("**Pasajeros**: 5", out_with_dims)

    def test_includes_freeform_ui_metadata_keys(self) -> None:
        vehicle = {
            "brand": "Nissan",
            "model": "Versa",
            "year": 2011,
            "price": "350000",
            "km": 45000,
            "transmission": "automatica",
            "engine": "1.6",
            "description": "Unidad impecable",
            "metadata": {"Puertas": "Cinco", "fuel": "Gasolina"},
        }
        out = format_vehicle_detail(vehicle, platform="web")
        self.assertIn("**Descripción**: Unidad impecable", out)
        self.assertIn("**Puertas**: Cinco", out)
        self.assertIn("**Combustible**: Gasolina", out)


class TestFormatVehicleDetailPitch(unittest.TestCase):
    def test_pitch_uses_description_as_tagline_and_custom_emoji(self) -> None:
        vehicle = {
            "brand": "Suzuki",
            "model": "Jimny 3 Puertas",
            "year": 2027,
            "price": "475990",
            "km": 0,
            "transmission": "manual / automatica",
            "engine": "1.5L",
            "image": "🗻",
            "description": "El legendario 4x4 puro.",
            "metadata": {"passengers": 4, "fuelCombinedKmL": 15.4},
        }
        parts = format_vehicle_detail_pitch(vehicle)
        self.assertEqual(parts["title_line"], "🗻 Suzuki Jimny 3 Puertas 2027")
        self.assertEqual(parts["tagline"], "El legendario 4x4 puro.")
        self.assertEqual(parts["price_line"], "💰 Desde $475,990")
        self.assertTrue(any("Motor 1.5L" in b and "15.4 km/l" in b for b in parts["bullets"]))
        self.assertTrue(any("Transmisión" in b for b in parts["bullets"]))
        self.assertLessEqual(len(parts["bullets"]), 4)

        assembled = assemble_vehicle_detail_pitch(
            title_line=parts["title_line"],
            tagline=parts["tagline"],
            bullets=parts["bullets"],
            price_line=parts["price_line"],
            closing="Es para quien quiere diversión pura.",
        )
        self.assertIn("🗻 Suzuki Jimny 3 Puertas 2027", assembled)
        self.assertIn("El legendario 4x4 puro.", assembled)
        self.assertIn("✅", assembled)
        self.assertIn("💰 Desde $475,990", assembled)
        self.assertIn("Es para quien quiere diversión pura.", assembled)

    def test_pitch_omits_empty_tagline_and_defaults_emoji(self) -> None:
        vehicle = {
            "brand": "Suzuki",
            "model": "Swift",
            "year": 2027,
            "price": "343990.50",
            "km": 100,
            "transmission": "CVT",
            "engine": "1.2L Mild Hybrid",
            "description": "",
        }
        parts = format_vehicle_detail_pitch(vehicle)
        self.assertTrue(parts["title_line"].startswith("🚗 "))
        self.assertEqual(parts["tagline"], "")
        self.assertEqual(parts["price_line"], "💰 Desde $343,990.50")
        assembled = assemble_vehicle_detail_pitch(
            title_line=parts["title_line"],
            tagline="",
            bullets=parts["bullets"],
            price_line=parts["price_line"],
            closing="",
        )
        self.assertNotIn("\n\n", assembled)
        self.assertIn("Motor 1.2L Mild Hybrid", assembled)


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
        self.assertNotIn("Enganche minimo", out)
        self.assertNotIn("Plazo minimo", out)

    def test_comparison_includes_optional_min_fields_when_present(self) -> None:
        plan_a = {
            "name": "Plan A",
            "lender": "Banco X",
            "rate": "12.5",
            "showRate": True,
            "minDownPaymentPercent": "20",
            "minTermMonths": 12,
            "maxTermMonths": 48,
            "requirements": [],
            "vehicles": [],
            "active": True,
        }
        plan_b = {
            "name": "Plan B",
            "lender": "Banco Y",
            "rate": "10",
            "showRate": True,
            "minDownPaymentPercent": None,
            "minTermMonths": None,
            "maxTermMonths": 60,
            "requirements": [],
            "vehicles": [],
            "active": True,
        }
        out = format_financing_plan_comparison(plan_a, plan_b, platform="web")
        self.assertIn("Enganche minimo", out)
        self.assertIn("20.00%", out)
        self.assertIn("Plazo minimo", out)
        self.assertIn("12 meses", out)


class TestFormatFinancingPlansOptionalMins(unittest.TestCase):
    def _plan(self, **overrides: object) -> dict:
        base = {
            "name": "Plan A",
            "lender": "BBVA",
            "rate": "14.5",
            "showRate": True,
            "maxTermMonths": 48,
            "active": True,
            "requirements": [],
            "vehicles": [
                {"brand": "Nissan", "model": "Versa", "year": 2020, "status": "available"}
            ],
        }
        base.update(overrides)
        return base

    def test_omits_min_fields_when_empty(self) -> None:
        out = format_financing_plans([self._plan()], platform="web")
        self.assertNotIn("Enganche minimo", out)
        self.assertNotIn("Plazo minimo", out)
        self.assertIn("Plazo maximo", out)

    def test_includes_min_fields_when_present(self) -> None:
        out = format_financing_plans(
            [self._plan(minDownPaymentPercent="15.5", minTermMonths=24)],
            platform="web",
        )
        self.assertIn("Enganche minimo", out)
        self.assertIn("15.50%", out)
        self.assertIn("Plazo minimo", out)
        self.assertIn("24 meses", out)

    def test_includes_requirement_description(self) -> None:
        out = format_financing_plans(
            [
                self._plan(
                    requirements=[
                        {
                            "title": "Requisitos Credito",
                            "description": (
                                "Identificacion oficial INE. "
                                "Ultimos 3 estados de cuenta bancarios de ingresos. "
                                "Comprobante de domicilio"
                            ),
                        }
                    ]
                )
            ],
            platform="web",
        )
        self.assertIn("Requisitos Credito", out)
        self.assertIn("Identificacion oficial INE", out)
        self.assertIn("Comprobante de domicilio", out)

    def test_vehicle_listing_includes_optional_mins(self) -> None:
        out = format_financing_plans_for_vehicle(
            "Nissan Versa 2020",
            [self._plan(minDownPaymentPercent=20, minTermMonths=12)],
            platform="web",
        )
        self.assertIn("Enganche minimo", out)
        self.assertIn("20.00%", out)
        self.assertIn("Plazo minimo", out)
        self.assertIn("12 meses", out)

    def test_vehicle_listing_omits_empty_mins(self) -> None:
        out = format_financing_plans_for_vehicle(
            "Nissan Versa 2020",
            [self._plan(minDownPaymentPercent=None, minTermMonths="")],
            platform="web",
        )
        self.assertNotIn("Enganche minimo", out)
        self.assertNotIn("Plazo minimo", out)


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
