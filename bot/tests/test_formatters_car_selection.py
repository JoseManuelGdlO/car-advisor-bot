from __future__ import annotations

import unittest

from src.utils.formatters import (
    format_candidate_options,
    format_images_bulleted_list,
    format_vehicle_name,
)


class CarSelectionFormattersTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
