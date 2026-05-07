from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from src.tools.vehicles import detect_vehicle_filters, search_vehicles


class PriceFiltersTests(unittest.TestCase):
    def test_detect_vehicle_filters_extracts_price_range_with_colloquial_units(self) -> None:
        vehicles = [{"brand": "Nissan", "model": "Versa", "color": "rojo", "year": 2011}]
        filters = detect_vehicle_filters("busco un versa entre 150 mil y 220k", vehicles)
        self.assertEqual(filters.get("model"), "Versa")
        self.assertEqual(filters.get("minPrice"), 150000)
        self.assertEqual(filters.get("maxPrice"), 220000)

    def test_detect_vehicle_filters_extracts_max_budget(self) -> None:
        vehicles: list[dict] = []
        filters = detect_vehicle_filters("mi presupuesto maximo 2000", vehicles)
        self.assertEqual(filters, {"maxPrice": 2000})

    def test_detect_vehicle_filters_extracts_hasta_keyword(self) -> None:
        filters = detect_vehicle_filters("quiero opciones hasta 100k", [])
        self.assertEqual(filters.get("maxPrice"), 100000)

    def test_detect_vehicle_filters_extracts_desde_keyword(self) -> None:
        filters = detect_vehicle_filters("busco carros desde 50k", [])
        self.assertEqual(filters.get("minPrice"), 50000)

    @patch("src.tools.vehicles.requests.get")
    def test_search_vehicles_sends_price_params(self, mock_get: Mock) -> None:
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = []
        mock_get.return_value = response

        search_vehicles({"minPrice": 1000, "maxPrice": 3000, "model": "Versa", "badKey": "x"})

        _, kwargs = mock_get.call_args
        self.assertEqual(kwargs["params"]["minPrice"], 1000)
        self.assertEqual(kwargs["params"]["maxPrice"], 3000)
        self.assertEqual(kwargs["params"]["model"], "Versa")
        self.assertNotIn("badKey", kwargs["params"])


if __name__ == "__main__":
    unittest.main()
