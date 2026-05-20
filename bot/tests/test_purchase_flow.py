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
        state["last_bot_message"] = (
            "¿Te interesa agendar una prueba de manejo o ver este vehículo en persona? Responde si o no."
        )
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
            patch(
                "src.nodes.lead_capture.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
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
        state["vehicle_images_last_batch"] = ["/img/1.jpg", "/img/2.jpg"]
        state["last_bot_message"] = (
            "¿Te interesa agendar una prueba de manejo o ver este vehículo en persona? Responde si o no."
        )
        state = with_user_message(state, "muestrame mas imagenes")

        vehicles = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2004, "status": "available"}]
        step_neutral = {
            "ask_promotions": False,
            "ask_financing": False,
            "ask_images": False,
            "ask_more_images": False,
            "wants_compare_two_vehicles": False,
            "wants_other_vehicles": False,
            "confirm_purchase": False,
            "reject_purchase": False,
        }
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.classify_vehicle_step_flags", return_value=step_neutral),
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
        state["vehicle_images_last_batch"] = ["/img/1.jpg"]
        state["last_bot_message"] = (
            "¿Te interesa agendar una prueba de manejo o ver este vehículo en persona? Responde si o no."
        )
        state = with_user_message(state, "quiero ver mas imagenes")

        vehicles = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2004, "status": "available"}]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.classify_purchase_confirmation_intent", return_value="VER_MAS_IMAGENES"),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
        ):
            updated = self.graph.invoke(state)

        last = str(updated["messages"][-1]["content"]).lower()
        self.assertIn("ya no hay", last)
        self.assertIn("imagen", last)

    def test_price_question_while_awaiting_confirmation_keeps_selection(self) -> None:
        """Pregunta por precio del vehiculo mostrado no debe listar todo el catalogo."""

        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Dodge Ram 2015"
        state["selected_vehicle_id"] = "veh-ram"
        state["awaiting_purchase_confirmation"] = True
        state["vehicle_images_last_batch"] = ["/img/1.jpg"]
        state["last_bot_message"] = (
            "¿Te interesa agendar una prueba de manejo o ver este vehículo en persona? "
            "También puedes pedir ver más imágenes del mismo."
        )
        state = with_user_message(state, "que precio tiene?")

        vehicles = [{"id": "veh-ram", "brand": "Dodge", "model": "Ram", "year": 2015, "status": "available"}]
        ram_detail = {
            "id": "veh-ram",
            "brand": "Dodge",
            "model": "Ram",
            "year": 2015,
            "status": "available",
            "price": 450000,
            "km": 120000,
            "transmission": "automatica",
            "engine": "5.7",
            "color": "negro",
            "description": "",
        }
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=ram_detail),
            patch(
                "src.nodes.car_selection.classify_purchase_confirmation_intent",
                return_value="PREGUNTA_MODELO",
            ),
            patch(
                "src.nodes.car_selection.generate_selected_vehicle_qa_response",
                return_value="El precio listado es $450,000.00.",
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        self.assertEqual(updated.get("selected_vehicle_id"), "veh-ram")
        self.assertEqual(updated.get("selected_car"), "Dodge Ram 2015")
        tail = "\n".join(m["content"] for m in updated["messages"][-2:])
        self.assertIn("450", tail)
        self.assertNotIn("Nissan", tail)

    def test_pregunta_modelo_km_while_awaiting_confirmation(self) -> None:
        """PREGUNTA_MODELO responde desde ficha sin listar catalogo."""

        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Dodge Ram 2015"
        state["selected_vehicle_id"] = "veh-ram"
        state["awaiting_purchase_confirmation"] = True
        state["vehicle_images_last_batch"] = []
        state["last_bot_message"] = (
            "¿Te interesa agendar una prueba de manejo o ver este vehículo en persona? "
            "También puedes pedir ver más imágenes del mismo."
        )
        state = with_user_message(state, "cuantos kilometros tiene?")

        vehicles = [{"id": "veh-ram", "brand": "Dodge", "model": "Ram", "year": 2015, "status": "available"}]
        ram_detail = {
            "id": "veh-ram",
            "brand": "Dodge",
            "model": "Ram",
            "year": 2015,
            "status": "available",
            "price": 450000,
            "km": 120000,
            "transmission": "automatica",
            "engine": "5.7",
            "color": "negro",
            "description": "",
        }
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=ram_detail),
            patch(
                "src.nodes.car_selection.classify_purchase_confirmation_intent",
                return_value="PREGUNTA_MODELO",
            ),
            patch(
                "src.nodes.car_selection.generate_selected_vehicle_qa_response",
                return_value="Tiene 120,000 km registrados.",
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        self.assertEqual(updated.get("selected_vehicle_id"), "veh-ram")
        tail = "\n".join(m["content"] for m in updated["messages"][-2:])
        self.assertIn("120", tail)

    def test_purchase_classifier_view_model_shows_requested_vehicle_detail(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Dodge Ram 2015"
        state["selected_vehicle_id"] = "veh-ram"
        state["awaiting_purchase_confirmation"] = True
        state["last_bot_message"] = (
            "¿Te interesa agendar una prueba de manejo o ver este vehículo en persona? "
            "También puedes pedir ver más imágenes del mismo."
        )
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
        step_neutral = {
            "ask_promotions": False,
            "ask_financing": False,
            "ask_images": False,
            "ask_more_images": False,
            "wants_other_vehicles": False,
            "confirm_purchase": False,
            "reject_purchase": False,
        }
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.classify_vehicle_step_flags", return_value=step_neutral),
            patch("src.nodes.car_selection.classify_purchase_confirmation_intent", return_value="VER_MODELO"),
            patch("src.nodes.car_selection.search_vehicles", return_value=[versa_detail]),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=versa_detail),
            patch(
                "src.nodes.car_selection.generate_vehicle_detail_conversation",
                return_value="Detalle del vehiculo: Nissan Versa 2011.",
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("selected_vehicle_id"), "veh-versa")
        self.assertEqual(updated.get("selected_car"), "Nissan Versa 2004")

    def test_purchase_classifier_first_images_fetches_top_batch(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state = with_user_message(state, "muestrame fotos del auto")

        vehicles = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2004, "status": "available"}]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch(
                "src.nodes.car_selection.classify_vehicle_step_flags",
                return_value={
                    "ask_promotions": False,
                    "ask_financing": False,
                    "ask_images": True,
                    "ask_more_images": False,
                    "wants_compare_two_vehicles": False,
                    "wants_other_vehicles": False,
                    "confirm_purchase": False,
                    "reject_purchase": False,
                },
            ),
            patch(
                "src.utils.vehicle_images.fetch_vehicle_images",
                return_value={"images": ["/img/1.jpg"], "nextCursor": 1, "hasMore": False, "mode": "top"},
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("vehicle_images_last_batch"), ["/img/1.jpg"])
        self.assertIn("/img/1.jpg", updated["messages"][-1]["content"])

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

