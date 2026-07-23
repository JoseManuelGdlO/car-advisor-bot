from __future__ import annotations

import json
from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class PurchaseFlowTests(GraphTestCase):
    def test_test_drive_typo_routes_to_lead_capture_without_classifier_si(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Toyota Corolla LE 2021"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state["last_bot_message"] = (
            "¿Te gustaría agendar una prueba de manejo o ver este vehículo en persona? 🚗✨"
        )
        state = with_user_message(state, "quiero una prubea de maneja")

        vehicles = [
            {
                "id": "veh-1",
                "brand": "Toyota",
                "model": "Corolla LE",
                "year": 2021,
                "status": "available",
            }
        ]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch(
                "src.nodes.car_selection.classify_vehicle_step_flags",
                return_value={
                    "ask_promotions": False,
                    "ask_financing": False,
                    "ask_images": False,
                    "ask_more_images": False,
                    "wants_compare_two_vehicles": False,
                    "wants_other_vehicles": False,
                    "confirm_purchase": False,
                    "reject_purchase": False,
                },
            ),
            patch("src.nodes.car_selection.classify_purchase_confirmation_intent", return_value="UNKNOWN"),
            patch(
                "src.nodes.lead_capture.generate_lead_capture_scheduling_message",
                return_value=(
                    "Para agendar Toyota Corolla LE 2021 abre: "
                    "https://calendar.app.google/tYniJNfcrd8qXvut8"
                ),
            ),
            patch("src.nodes.lead_capture.notify_advisor"),
            patch("src.nodes.lead_capture.push_event_to_backend"),
            patch("src.nodes.lead_capture.deactivate_bot", side_effect=lambda s, **_: {**s, "bot_disabled": True}),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "router")
        self.assertTrue(updated.get("lead_capture_done"))
        self.assertFalse(updated.get("awaiting_purchase_confirmation"))
        self.assertEqual(updated.get("contact_method"), "appointment")
        last = updated["messages"][-1]["content"]
        self.assertIn("Toyota Corolla LE 2021", last)
        self.assertIn("calendar.app.google", last)

    def test_test_drive_beats_financing_flag_from_classifier(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Toyota Corolla LE 2021"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state["last_bot_message"] = (
            "¿Te gustaría agendar una prueba de manejo o ver este vehículo en persona? 🚗✨"
        )
        state = with_user_message(state, "Quiero una prueba")

        vehicles = [
            {
                "id": "veh-1",
                "brand": "Toyota",
                "model": "Corolla LE",
                "year": 2021,
                "status": "available",
            }
        ]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch(
                "src.nodes.car_selection.classify_vehicle_step_flags",
                return_value={
                    "ask_promotions": False,
                    "ask_financing": True,
                    "ask_images": False,
                    "ask_more_images": False,
                    "wants_compare_two_vehicles": False,
                    "wants_other_vehicles": False,
                    "confirm_purchase": False,
                    "reject_purchase": False,
                },
            ),
            patch(
                "src.nodes.lead_capture.generate_lead_capture_scheduling_message",
                return_value=(
                    "Para agendar Toyota Corolla LE 2021 abre: "
                    "https://calendar.app.google/tYniJNfcrd8qXvut8"
                ),
            ),
            patch("src.nodes.lead_capture.notify_advisor"),
            patch("src.nodes.lead_capture.push_event_to_backend"),
            patch("src.nodes.lead_capture.deactivate_bot", side_effect=lambda s, **_: {**s, "bot_disabled": True}),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "router")
        self.assertTrue(updated.get("lead_capture_done"))
        self.assertIn("calendar.app.google", updated["messages"][-1]["content"])

    def test_purchase_yes_without_contact_method_reasks_preference(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state["last_bot_message"] = (
            "¿Prefieres que te contacte por aquí por WhatsApp, por llamada o deseas agendar una cita?"
        )
        state = with_user_message(state, "si")

        vehicles = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2004, "status": "available"}]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch(
                "src.nodes.car_selection.classify_vehicle_step_flags",
                return_value={
                    "ask_promotions": False,
                    "ask_financing": False,
                    "ask_images": False,
                    "ask_more_images": False,
                    "wants_compare_two_vehicles": False,
                    "wants_other_vehicles": False,
                    "confirm_purchase": True,
                    "reject_purchase": False,
                },
            ),
            patch("src.nodes.car_selection.classify_contact_method", return_value="UNKNOWN"),
            patch("src.nodes.car_selection.classify_purchase_confirmation_intent", return_value="SI"),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        self.assertFalse(updated.get("lead_capture_done"))
        last = updated["messages"][-1]["content"]
        self.assertIn("WhatsApp", last)
        self.assertIn("llamada", last)
        self.assertIn("cita", last)

    def test_whatsapp_preference_routes_to_lead_capture_thanks(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state["last_bot_message"] = (
            "¿Prefieres que te contacte por aquí por WhatsApp, por llamada o deseas agendar una cita?"
        )
        state = with_user_message(state, "por whatsapp")

        vehicles = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2004, "status": "available"}]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch(
                "src.nodes.car_selection.classify_vehicle_step_flags",
                return_value={
                    "ask_promotions": False,
                    "ask_financing": False,
                    "ask_images": False,
                    "ask_more_images": False,
                    "wants_compare_two_vehicles": False,
                    "wants_other_vehicles": False,
                    "confirm_purchase": False,
                    "reject_purchase": False,
                },
            ),
            patch("src.nodes.lead_capture.notify_advisor"),
            patch("src.nodes.lead_capture.push_event_to_backend") as event_mock,
            patch("src.nodes.lead_capture.deactivate_bot", side_effect=lambda s, **_: {**s, "bot_disabled": True}),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "router")
        self.assertTrue(updated.get("lead_capture_done"))
        self.assertEqual(updated.get("contact_method"), "whatsapp")
        self.assertEqual(updated["messages"][-1]["content"], "Perfecto! gracias")
        payload = event_mock.call_args.args[0]
        self.assertEqual(payload["contact_method"], "whatsapp")
        self.assertTrue(str(payload["message"]).startswith("Cliente interesado en:"))
        self.assertIn("Nissan Versa 2004", payload["message"])
        self.assertIn("purchase_preferences", payload)

    def test_call_preference_routes_to_lead_capture_thanks(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state["last_bot_message"] = (
            "¿Prefieres que te contacte por aquí por WhatsApp, por llamada o deseas agendar una cita?"
        )
        state = with_user_message(state, "mejor por llamada")

        vehicles = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2004, "status": "available"}]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch(
                "src.nodes.car_selection.classify_vehicle_step_flags",
                return_value={
                    "ask_promotions": False,
                    "ask_financing": False,
                    "ask_images": False,
                    "ask_more_images": False,
                    "wants_compare_two_vehicles": False,
                    "wants_other_vehicles": False,
                    "confirm_purchase": False,
                    "reject_purchase": False,
                },
            ),
            patch("src.nodes.lead_capture.notify_advisor"),
            patch("src.nodes.lead_capture.push_event_to_backend") as event_mock,
            patch("src.nodes.lead_capture.deactivate_bot", side_effect=lambda s, **_: {**s, "bot_disabled": True}),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("contact_method"), "call")
        self.assertEqual(updated["messages"][-1]["content"], "Perfecto! gracias")
        self.assertEqual(event_mock.call_args.args[0]["contact_method"], "call")

    def test_appointment_preference_sends_calendar_link(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state["last_bot_message"] = (
            "¿Prefieres que te contacte por aquí por WhatsApp, por llamada o deseas agendar una cita?"
        )
        state = with_user_message(state, "quiero agendar una cita")

        vehicles = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2004, "status": "available"}]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch(
                "src.nodes.car_selection.classify_vehicle_step_flags",
                return_value={
                    "ask_promotions": False,
                    "ask_financing": False,
                    "ask_images": False,
                    "ask_more_images": False,
                    "wants_compare_two_vehicles": False,
                    "wants_other_vehicles": False,
                    "confirm_purchase": False,
                    "reject_purchase": False,
                },
            ),
            patch(
                "src.nodes.lead_capture.generate_lead_capture_scheduling_message",
                return_value=(
                    "Para agendar Nissan Versa 2004 abre: "
                    "https://calendar.app.google/tYniJNfcrd8qXvut8"
                ),
            ),
            patch("src.nodes.lead_capture.notify_advisor"),
            patch("src.nodes.lead_capture.push_event_to_backend") as event_mock,
            patch("src.nodes.lead_capture.deactivate_bot", side_effect=lambda s, **_: {**s, "bot_disabled": True}),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("contact_method"), "appointment")
        self.assertIn("calendar.app.google", updated["messages"][-1]["content"])
        self.assertEqual(event_mock.call_args.args[0]["contact_method"], "appointment")

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
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=vehicles[0]),
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
            "¿Te gustaría agendar una prueba de manejo o ver este vehículo en persona? 🚗✨"
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

    def test_pregunta_modelo_sends_technical_sheet_on_whatsapp_when_available(self) -> None:
        state = initial_state()
        state["platform"] = "whatsapp"
        state["user_id"] = "5215512345678"
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Dodge Ram 2015"
        state["selected_vehicle_id"] = "veh-ram"
        state["technical_sheet_delivered_vehicle_id"] = "veh-ram"
        state["awaiting_purchase_confirmation"] = True
        state["vehicle_images_last_batch"] = []
        state["last_bot_message"] = (
            "¿Te gustaría agendar una prueba de manejo o ver este vehículo en persona? 🚗✨"
        )
        state = with_user_message(state, "dame la ficha tecnica")

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
            "technicalSheetUrl": "/uploads/autobot/ram-ficha.pdf",
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
                return_value="Te comparto los datos del vehiculo.",
            ),
        ):
            updated = self.graph.invoke(state)

        contents = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        document_blocks = [content for content in contents if "<<WC_DOCUMENT_JSON>>" in content]
        self.assertEqual(len(document_blocks), 1)
        self.assertIn("ram-ficha.pdf", document_blocks[0])
        payload = json.loads(document_blocks[0].replace("<<WC_DOCUMENT_JSON>>", "", 1))
        self.assertEqual(payload["caption"], "Aquí tienes la ficha técnica")
        self.assertEqual(updated.get("technical_sheet_delivered_vehicle_id"), "veh-ram")

    def test_pregunta_modelo_skips_technical_sheet_when_already_delivered(self) -> None:
        state = initial_state()
        state["platform"] = "web"
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Suzuki Dzire 2026"
        state["selected_vehicle_id"] = "veh-dzire"
        state["technical_sheet_delivered_vehicle_id"] = "veh-dzire"
        state["awaiting_purchase_confirmation"] = True
        state["vehicle_images_last_batch"] = []
        state["last_bot_message"] = (
            "¿Te gustaría agendar una prueba de manejo o ver este vehículo en persona? 🚗✨"
        )
        state = with_user_message(state, "Cuáles son las dimensiones del vehículo?")

        vehicles = [{"id": "veh-dzire", "brand": "Suzuki", "model": "Dzire", "year": 2026, "status": "available"}]
        dzire_detail = {
            "id": "veh-dzire",
            "brand": "Suzuki",
            "model": "Dzire",
            "year": 2026,
            "status": "available",
            "price": 312990,
            "km": 0,
            "transmission": "manual",
            "engine": "1.2",
            "color": "blanco",
            "description": "Sedan eficiente",
            "technicalSheetUrl": "/uploads/autobot/dzire-ficha.pdf",
            "metadata": {"lengthMm": 3995, "widthMm": 1735},
        }
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=dzire_detail),
            patch(
                "src.nodes.car_selection.classify_purchase_confirmation_intent",
                return_value="PREGUNTA_MODELO",
            ),
            patch(
                "src.nodes.car_selection.generate_selected_vehicle_qa_response",
                return_value="La longitud total es 3995 mm y el ancho total 1735 mm.",
            ),
        ):
            updated = self.graph.invoke(state)

        contents = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        joined = "\n".join(contents)
        self.assertIn("3995", joined)
        self.assertNotIn("dzire-ficha.pdf", joined)
        self.assertNotIn("ficha técnica", joined.lower())
        self.assertEqual(updated.get("technical_sheet_delivered_vehicle_id"), "veh-dzire")

    def test_pregunta_modelo_skips_technical_sheet_when_not_yet_delivered(self) -> None:
        """QA generica no adjunta PDF aunque la ficha nunca se haya enviado."""
        state = initial_state()
        state["platform"] = "web"
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Suzuki Dzire 2026"
        state["selected_vehicle_id"] = "veh-dzire"
        state["technical_sheet_delivered_vehicle_id"] = ""
        state["awaiting_purchase_confirmation"] = True
        state["vehicle_images_last_batch"] = []
        state["last_bot_message"] = (
            "¿Te gustaría agendar una prueba de manejo o ver este vehículo en persona? 🚗✨"
        )
        state = with_user_message(state, "cuantos kilometros tiene?")

        vehicles = [{"id": "veh-dzire", "brand": "Suzuki", "model": "Dzire", "year": 2026, "status": "available"}]
        dzire_detail = {
            "id": "veh-dzire",
            "brand": "Suzuki",
            "model": "Dzire",
            "year": 2026,
            "status": "available",
            "price": 312990,
            "km": 0,
            "transmission": "manual",
            "engine": "1.2",
            "color": "blanco",
            "description": "Sedan eficiente",
            "technicalSheetUrl": "/uploads/autobot/dzire-ficha.pdf",
        }
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=dzire_detail),
            patch(
                "src.nodes.car_selection.classify_vehicle_step_flags",
                return_value={
                    "ask_promotions": False,
                    "ask_financing": False,
                    "ask_images": False,
                    "ask_more_images": False,
                    "wants_compare_two_vehicles": False,
                    "wants_other_vehicles": False,
                    "confirm_purchase": False,
                    "reject_purchase": False,
                },
            ),
            patch(
                "src.nodes.car_selection.classify_purchase_confirmation_intent",
                return_value="PREGUNTA_MODELO",
            ),
            patch(
                "src.nodes.car_selection.generate_selected_vehicle_qa_response",
                return_value="Es un vehiculo nuevo (0 km).",
            ),
        ):
            updated = self.graph.invoke(state)

        contents = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        joined = "\n".join(contents)
        self.assertIn("0 km", joined)
        self.assertNotIn("dzire-ficha.pdf", joined)
        self.assertNotIn("ficha técnica", joined.lower())
        self.assertEqual(updated.get("technical_sheet_delivered_vehicle_id"), "")

    def test_pregunta_modelo_skips_technical_sheet_when_missing(self) -> None:
        state = initial_state()
        state["platform"] = "whatsapp"
        state["user_id"] = "5215512345678"
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Dodge Ram 2015"
        state["selected_vehicle_id"] = "veh-ram"
        state["awaiting_purchase_confirmation"] = True
        state["vehicle_images_last_batch"] = []
        state["last_bot_message"] = (
            "¿Te gustaría agendar una prueba de manejo o ver este vehículo en persona? 🚗✨"
        )
        state = with_user_message(state, "dame la ficha tecnica")

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
                return_value="Te comparto los datos del vehiculo.",
            ),
        ):
            updated = self.graph.invoke(state)

        contents = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertFalse(any("<<WC_DOCUMENT_JSON>>" in content for content in contents))
        self.assertEqual(len(contents), 2)

    def test_purchase_classifier_view_model_shows_requested_vehicle_detail(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Dodge Ram 2015"
        state["selected_vehicle_id"] = "veh-ram"
        state["awaiting_purchase_confirmation"] = True
        state["last_bot_message"] = (
            "¿Te gustaría agendar una prueba de manejo o ver este vehículo en persona? 🚗✨"
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
        state["platform"] = "whatsapp"
        state["user_id"] = "5215512345678"
        state["current_node"] = "car_selection"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state["technical_sheet_delivered_vehicle_id"] = ""
        state = with_user_message(state, "muestrame fotos del auto")

        vehicles = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2004, "status": "available"}]
        detail = {
            "id": "veh-1",
            "brand": "Nissan",
            "model": "Versa",
            "year": 2004,
            "status": "available",
            "technicalSheetUrl": "/uploads/autobot/versa-ficha.pdf",
        }
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=detail),
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
        contents = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        joined = "\n".join(contents)
        self.assertIn("/img/1.jpg", joined)
        document_blocks = [content for content in contents if "<<WC_DOCUMENT_JSON>>" in content]
        self.assertEqual(len(document_blocks), 1)
        self.assertIn("versa-ficha.pdf", document_blocks[0])
        self.assertEqual(updated.get("technical_sheet_delivered_vehicle_id"), "veh-1")

    def test_purchase_classifier_first_images_skips_sheet_when_already_delivered(self) -> None:
        state = initial_state()
        state["platform"] = "web"
        state["current_node"] = "car_selection"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state["technical_sheet_delivered_vehicle_id"] = "veh-1"
        state = with_user_message(state, "muestrame fotos del auto")

        vehicles = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2004, "status": "available"}]
        detail = {
            "id": "veh-1",
            "brand": "Nissan",
            "model": "Versa",
            "year": 2004,
            "status": "available",
            "technicalSheetUrl": "/uploads/autobot/versa-ficha.pdf",
        }
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=detail),
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

        joined = "\n".join(m["content"] for m in updated["messages"] if m.get("role") == "assistant")
        self.assertIn("/img/1.jpg", joined)
        self.assertNotIn("versa-ficha.pdf", joined)
        self.assertNotIn("ficha técnica", joined.lower())
        self.assertEqual(updated.get("technical_sheet_delivered_vehicle_id"), "veh-1")

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
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=vehicles[0]),
            patch(
                "src.nodes.car_selection.classify_vehicle_step_flags",
                return_value={
                    "ask_promotions": False,
                    "ask_financing": False,
                    "ask_images": False,
                    "ask_more_images": False,
                    "wants_compare_two_vehicles": False,
                    "wants_other_vehicles": False,
                    "confirm_purchase": False,
                    "reject_purchase": False,
                },
            ),
            patch("src.nodes.car_selection.classify_purchase_confirmation_intent", return_value="VER_MAS_IMAGENES"),
            patch(
                "src.nodes.car_selection.fetch_vehicle_images",
                return_value={"images": [], "nextCursor": 5, "hasMore": False, "mode": "next"},
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertFalse(updated.get("is_faq_interrupt"))

