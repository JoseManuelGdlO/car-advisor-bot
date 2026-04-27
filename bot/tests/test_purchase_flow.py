from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class PurchaseFlowTests(GraphTestCase):
    def test_purchase_yes_continues_to_lead_capture_same_turn(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state["last_bot_message"] = "Te interesa comprar este vehiculo? Responde si o no."
        state = with_user_message(state, "si")

        vehicles = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2004, "status": "available"}]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.classify_purchase_confirmation_intent", return_value="SI"),
            patch(
                "src.nodes.lead_capture.generate_lead_capture_intro",
                return_value="Necesitamos datos para un asesor (Nissan Versa 2004). Cual es tu nombre completo?",
            ),
            patch("src.nodes.lead_capture.safe_llm_format", side_effect=lambda text: text),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "lead_capture")
        self.assertFalse(updated.get("awaiting_purchase_confirmation"))
        self.assertIn("Nissan Versa 2004", updated["messages"][-1]["content"])

    def test_purchase_classifier_more_images_fetches_next_batch(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state["vehicle_images_cursor"] = 2
        state["vehicle_images_has_more"] = True
        state["last_bot_message"] = "Te interesa comprar este vehiculo? Responde si o no."
        state = with_user_message(state, "muestrame mas imagenes")

        vehicles = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2004, "status": "available"}]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.classify_purchase_confirmation_intent", return_value="VER_MAS_IMAGENES"),
            patch(
                "src.nodes.car_selection.fetch_vehicle_images",
                return_value={"images": ["/img/3.jpg", "/img/4.jpg", "/img/5.jpg"], "nextCursor": 5, "hasMore": False, "mode": "next"},
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("vehicle_images_cursor"), 5)
        self.assertFalse(updated.get("vehicle_images_has_more"))

    def test_purchase_classifier_more_images_without_more_stock(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state["vehicle_images_cursor"] = 7
        state["vehicle_images_has_more"] = False
        state["last_bot_message"] = "Te interesa comprar este vehiculo? Responde si o no."
        state = with_user_message(state, "quiero ver mas imagenes")

        vehicles = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2004, "status": "available"}]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.classify_purchase_confirmation_intent", return_value="VER_MAS_IMAGENES"),
        ):
            updated = self.graph.invoke(state)

        self.assertIn("Ya no hay mas imagenes", updated["messages"][-1]["content"])

    def test_purchase_classifier_view_model_shows_requested_vehicle_detail(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Dodge Ram 2015"
        state["selected_vehicle_id"] = "veh-ram"
        state["awaiting_purchase_confirmation"] = True
        state["last_bot_message"] = "¿Te interesa comprar este vehículo o quieres ver más imágenes del mismo?"
        state = with_user_message(state, "Antes quiero ver el modelo nissan versa")

        vehicles = [
            {"id": "veh-ram", "brand": "Dodge", "model": "Ram", "year": 2015, "status": "available"},
            {"id": "veh-versa", "brand": "Nissan", "model": "Versa", "year": 2004, "status": "available"},
        ]
        versa_detail = {
            "id": "veh-versa",
            "brand": "Nissan",
            "model": "Versa",
            "year": 2004,
            "status": "available",
            "price": 350000,
            "km": 200000,
            "transmission": "automatica",
            "engine": "1.6",
            "color": "blanco",
            "description": "",
        }
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.classify_purchase_confirmation_intent", return_value="VER_MODELO"),
            patch("src.nodes.car_selection.search_vehicles", return_value=[versa_detail]),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=versa_detail),
            patch("src.nodes.car_selection.generate_vehicle_detail_intro", return_value="Detalle del vehiculo:"),
            patch(
                "src.nodes.car_selection.fetch_vehicle_images",
                return_value={"images": ["/img/versa-1.jpg", "/img/versa-2.jpg"], "nextCursor": 2, "hasMore": True, "mode": "top"},
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("selected_vehicle_id"), "veh-versa")
        self.assertEqual(updated.get("selected_car"), "Nissan Versa 2004")

    def test_more_images_reply_does_not_route_to_faq_when_awaiting_confirmation(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Dodge Ram 2015"
        state["selected_vehicle_id"] = "veh-ram"
        state["awaiting_purchase_confirmation"] = True
        state["vehicle_images_cursor"] = 5
        state["vehicle_images_has_more"] = False
        state["last_bot_message"] = "Estas son todas las imagenes disponibles de este vehiculo."
        state = with_user_message(state, "mas imagenes")

        vehicles = [{"id": "veh-ram", "brand": "Dodge", "model": "Ram", "year": 2015, "status": "available"}]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.classify_purchase_confirmation_intent", return_value="VER_MAS_IMAGENES"),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertFalse(updated.get("is_faq_interrupt"))

