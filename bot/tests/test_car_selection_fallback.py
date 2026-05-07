from __future__ import annotations

import unittest

from src.services.car_selection_fallback import (
    contains_signal_phrase,
    is_financing_request,
    is_general_request,
    is_more_images_request,
    is_promotions_request,
    is_selected_vehicle_specs_request,
    looks_like_feature_request,
    looks_like_specific_vehicle_request,
)


class CarSelectionFallbackTests(unittest.TestCase):
    def setUp(self) -> None:
        self.general = {"que carros tienes", "catalogo"}
        self.features = {"color", "modelo", "año"}
        self.more_images = {"mas imagenes", "ver mas fotos"}
        self.financing = {"plan de pagos", "financiamiento"}
        self.promotions = {"promociones", "descuento"}

    def test_contains_signal_phrase_respects_word_boundaries(self) -> None:
        self.assertTrue(contains_signal_phrase("quiero plan de pagos", "plan de pagos"))
        self.assertFalse(contains_signal_phrase("promocioneses hoy", "promociones"))

    def test_is_general_request_detects_catalog_intent(self) -> None:
        self.assertTrue(is_general_request("que carros tienes disponibles", self.general))
        self.assertFalse(is_general_request("quiero un versa rojo", self.general))

    def test_looks_like_feature_request_detects_year_or_feature_word(self) -> None:
        self.assertTrue(looks_like_feature_request("busco modelo 2020", self.features))
        self.assertTrue(looks_like_feature_request("quiero color rojo", self.features))
        self.assertFalse(looks_like_feature_request("hola", self.features))

    def test_looks_like_specific_vehicle_request_uses_injected_dependencies(self) -> None:
        result = looks_like_specific_vehicle_request(
            "tienes chevrolet?",
            is_general_request_fn=lambda _: False,
            looks_like_feature_request_fn=lambda _: False,
        )
        self.assertTrue(result)

    def test_more_images_financing_promotions_requests(self) -> None:
        self.assertTrue(is_more_images_request("muestrame mas imagenes", self.more_images))
        self.assertTrue(is_financing_request("quiero un plan de pagos", self.financing))
        self.assertTrue(is_promotions_request("tienes promociones hoy", self.promotions))

    def test_selected_vehicle_specs_request_false_when_changes_vehicle(self) -> None:
        selected_id = "veh-1"
        vehicles = [{"id": "veh-1"}, {"id": "veh-2"}]
        result = is_selected_vehicle_specs_request(
            "dame la ficha del versa",
            selected_vehicle_id=selected_id,
            vehicles=vehicles,
            pick_vehicle_from_filters_fn=lambda *_: {"id": "veh-2"},
        )
        self.assertFalse(result)

    def test_selected_vehicle_specs_request_true_when_same_vehicle_or_unresolved(self) -> None:
        selected_id = "veh-1"
        vehicles = [{"id": "veh-1"}]
        same_vehicle = is_selected_vehicle_specs_request(
            "dame la ficha tecnica",
            selected_vehicle_id=selected_id,
            vehicles=vehicles,
            pick_vehicle_from_filters_fn=lambda *_: {"id": "veh-1"},
        )
        unresolved_vehicle = is_selected_vehicle_specs_request(
            "muestrame los datos",
            selected_vehicle_id=selected_id,
            vehicles=vehicles,
            pick_vehicle_from_filters_fn=lambda *_: None,
        )
        self.assertTrue(same_vehicle)
        self.assertTrue(unresolved_vehicle)


if __name__ == "__main__":
    unittest.main()
