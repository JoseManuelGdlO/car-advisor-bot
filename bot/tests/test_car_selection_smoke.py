from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class CarSelectionSmokeTests(GraphTestCase):
    def test_smoke_general_catalog_request_shows_available(self) -> None:
        vehicles = [
            {"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"},
            {"id": "veh-2", "brand": "Dodge", "model": "Ram", "year": 2015, "status": "available"},
        ]
        state = with_user_message(initial_state(), "que carros tienes")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
        ):
            updated = self.graph.invoke(state)
        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertIn("Nissan", str(updated["messages"][-1]["content"]))

    def test_smoke_filters_select_single_vehicle(self) -> None:
        selected = {"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available", "price": 150000}
        vehicles = [selected]
        state = with_user_message(initial_state(), "quiero carros entre 100 mil y 200 mil")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.search_vehicles", return_value=[selected]),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=selected),
            patch("src.nodes.car_selection.generate_vehicle_detail_conversation", return_value="Detalle Nissan Versa."),
            patch("src.nodes.car_selection.fetch_vehicle_images", return_value={"images": [], "nextCursor": 0, "hasMore": False, "mode": "top"}),
        ):
            updated = self.graph.invoke(state)
        self.assertEqual(updated.get("selected_vehicle_id"), "veh-1")
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))

    def test_smoke_confirmation_more_images_branch(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Nissan Versa 2011"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state["vehicle_images_cursor"] = 2
        state["vehicle_images_has_more"] = True
        state["last_bot_message"] = "¿Te interesa comprar este vehículo o quieres ver más imágenes del mismo?"
        state = with_user_message(state, "quiero ver mas imagenes")

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[{"id": "veh-1", "brand": "Nissan", "model": "Versa"}]),
            patch("src.nodes.car_selection.classify_purchase_confirmation_intent", return_value="VER_MAS_IMAGENES"),
            patch(
                "src.nodes.car_selection.fetch_vehicle_images",
                return_value={"images": ["/img/3.jpg"], "nextCursor": 3, "hasMore": False, "mode": "next"},
            ),
        ):
            updated = self.graph.invoke(state)
        self.assertEqual(updated.get("vehicle_images_cursor"), 3)
        self.assertFalse(updated.get("vehicle_images_has_more"))
