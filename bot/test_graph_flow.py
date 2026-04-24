"""Tests unitarios del flujo principal del grafo conversacional."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from src.graph import build_graph


def _initial_state() -> dict:
    return {
        "messages": [],
        "current_node": "start",
        "intent": "",
        "selected_car": "",
        "selected_vehicle_id": "",
        "customer_info": {},
        "last_vehicle_candidates": [],
        "last_bot_message": "",
        "skip_car_prompt": False,
        "skip_lead_prompt": False,
        "resume_to_step": "",
        "is_faq_interrupt": False,
        "awaiting_purchase_confirmation": False,
        "platform": "web",
        "user_id": "",
        "lead_phone_attempts": 0,
        "lead_capture_done": False,
        "vehicle_images_cursor": 0,
        "vehicle_images_has_more": False,
        "vehicle_images_last_batch": [],
    }


def _with_user_message(state: dict, message: str) -> dict:
    updated = dict(state)
    messages = list(updated.get("messages", []))
    messages.append({"role": "user", "content": message, "type": "HumanMessage"})
    updated["messages"] = messages
    return updated


class GraphFlowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.graph = build_graph()

    def test_vehicle_request_routes_to_car_selection_and_shows_detail(self) -> None:
        vehicles = [
            {
                "id": "veh-1",
                "brand": "Nissan",
                "model": "Versa",
                "year": 2004,
                "status": "available",
                "price": 350000,
                "km": 200000,
                "transmission": "automatica",
                "engine": "v8 hemi",
                "color": "blanco",
                "description": "",
            }
        ]

        state = _with_user_message(_initial_state(), "hola tienen nissan versa")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.search_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=vehicles[0]),
            patch("src.nodes.car_selection.generate_vehicle_detail_intro", return_value="Detalle del vehiculo:"),
            patch(
                "src.nodes.car_selection.fetch_vehicle_images",
                return_value={
                    "images": ["/img/1.jpg", "/img/2.jpg"],
                    "nextCursor": 2,
                    "hasMore": True,
                    "mode": "top",
                },
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertEqual(updated.get("selected_vehicle_id"), "veh-1")
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        assistant_texts = [
            str(m.get("content", "")) for m in updated.get("messages", []) if m.get("role") == "assistant"
        ]
        joined = "\n".join(assistant_texts)
        self.assertIn("Detalle del vehiculo:", joined)
        self.assertIn("**Marca**: Nissan", joined)
        self.assertIn("/img/1.jpg", joined)
        self.assertIn("/img/2.jpg", joined)

    def test_whatsapp_uses_single_asterisk_for_vehicle_detail(self) -> None:
        vehicles = [
            {
                "id": "veh-1",
                "brand": "Nissan",
                "model": "Versa",
                "year": 2004,
                "status": "available",
                "price": 350000,
                "km": 200000,
                "transmission": "automatica",
                "engine": "v8 hemi",
                "color": "blanco",
                "description": "",
            }
        ]
        state = _with_user_message(_initial_state(), "hola tienen nissan versa")
        state["platform"] = "whatsapp"

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.search_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=vehicles[0]),
            patch("src.nodes.car_selection.generate_vehicle_detail_intro", return_value="Detalle del vehiculo:"),
            patch(
                "src.nodes.car_selection.fetch_vehicle_images",
                return_value={
                    "images": ["/img/1.jpg", "/img/2.jpg"],
                    "nextCursor": 2,
                    "hasMore": True,
                    "mode": "top",
                },
            ),
        ):
            updated = self.graph.invoke(state)

        assistant_texts = [
            str(m.get("content", "")) for m in updated.get("messages", []) if m.get("role") == "assistant"
        ]
        joined = "\n".join(assistant_texts)
        self.assertIn("*Marca*: Nissan", joined)
        self.assertNotIn("**Marca**: Nissan", joined)

    def test_faq_message_routes_to_faq_node(self) -> None:
        state = _with_user_message(_initial_state(), "hola donde se encuentran ubicados?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": True}),
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["Estamos en Av. Siempre Viva 123."]),
            patch("src.nodes.faq.safe_llm_format", return_value="Estamos en Av. Siempre Viva 123."),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "start")
        self.assertFalse(updated.get("is_faq_interrupt"))
        self.assertIn("Siempre Viva 123", updated["messages"][-1]["content"])

    def test_purchase_yes_continues_to_lead_capture_same_turn(self) -> None:
        state = _initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state["last_bot_message"] = "Te interesa comprar este vehiculo? Responde si o no."
        state = _with_user_message(state, "si")

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
                "src.nodes.lead_capture.safe_llm_format",
                side_effect=lambda text: text,
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "lead_capture")
        self.assertFalse(updated.get("awaiting_purchase_confirmation"))
        self.assertIn("Nissan Versa 2004", updated["messages"][-1]["content"])
        self.assertIn("nombre", updated["messages"][-1]["content"].lower())

    def test_faq_interrupt_resumes_lead_capture_next_turn(self) -> None:
        state = _initial_state()
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Para apartar Nissan Versa 2004, comparte tus datos en formato nombre:..., telefono:..., email:....",
                "type": "AIMessage",
            }
        ]
        state["current_node"] = "lead_capture"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["last_bot_message"] = state["messages"][-1]["content"]

        faq_turn = _with_user_message(state, "donde se ubican?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": True}),
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["Estamos en Centro."]),
            patch("src.nodes.faq.safe_llm_format", return_value="Estamos en Centro."),
        ):
            after_faq = self.graph.invoke(faq_turn)

        self.assertEqual(after_faq.get("current_node"), "lead_capture")
        self.assertFalse(after_faq.get("is_faq_interrupt"))
        self.assertFalse(after_faq.get("skip_lead_prompt"))

        # Tras FAQ, el bot no pide "nombre" en el mismo turno: se simula un turno donde
        # ya se pidio nombre y el usuario responde con nombre completo (web + user_id = telefono).
        resume_state = _initial_state()
        resume_state["current_node"] = "lead_capture"
        resume_state["intent"] = "vehicle_catalog"
        resume_state["selected_car"] = "Nissan Versa 2004"
        resume_state["selected_vehicle_id"] = "veh-1"
        resume_state["platform"] = "web"
        resume_state["user_id"] = "5512345678"
        resume_state["messages"] = [
            {
                "role": "assistant",
                "content": "Para contactarte con un asesor, cual es tu nombre completo?",
                "type": "AIMessage",
            },
            {"role": "user", "content": "Juan Pérez", "type": "HumanMessage"},
        ]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.lead_capture.safe_llm_format", side_effect=lambda text: text),
        ):
            resumed = self.graph.invoke(resume_state)

        self.assertEqual(resumed.get("current_node"), "lead_capture")
        self.assertIn("correo", resumed["messages"][-1]["content"].lower())

    def test_purchase_classifier_more_images_fetches_next_batch(self) -> None:
        state = _initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state["vehicle_images_cursor"] = 2
        state["vehicle_images_has_more"] = True
        state["last_bot_message"] = "Te interesa comprar este vehiculo? Responde si o no."
        state = _with_user_message(state, "muestrame mas imagenes")

        vehicles = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2004, "status": "available"}]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.classify_purchase_confirmation_intent", return_value="VER_MAS_IMAGENES"),
            patch(
                "src.nodes.car_selection.fetch_vehicle_images",
                return_value={
                    "images": ["/img/3.jpg", "/img/4.jpg", "/img/5.jpg"],
                    "nextCursor": 5,
                    "hasMore": False,
                    "mode": "next",
                },
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        self.assertEqual(updated.get("vehicle_images_cursor"), 5)
        self.assertFalse(updated.get("vehicle_images_has_more"))
        self.assertEqual(updated.get("vehicle_images_last_batch"), ["/img/3.jpg", "/img/4.jpg", "/img/5.jpg"])
        last_msg = updated["messages"][-1]["content"]
        self.assertIn("/img/3.jpg", last_msg)
        self.assertNotIn("/img/1.jpg", last_msg)

    def test_purchase_classifier_more_images_without_more_stock(self) -> None:
        state = _initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state["vehicle_images_cursor"] = 7
        state["vehicle_images_has_more"] = False
        state["last_bot_message"] = "Te interesa comprar este vehiculo? Responde si o no."
        state = _with_user_message(state, "quiero ver mas imagenes")

        vehicles = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2004, "status": "available"}]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.classify_purchase_confirmation_intent", return_value="VER_MAS_IMAGENES"),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        self.assertIn("Ya no hay mas imagenes", updated["messages"][-1]["content"])

    def test_purchase_classifier_view_model_shows_requested_vehicle_detail(self) -> None:
        state = _initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Dodge Ram 2015"
        state["selected_vehicle_id"] = "veh-ram"
        state["awaiting_purchase_confirmation"] = True
        state["last_bot_message"] = (
            "¿Te interesa comprar este vehículo o quieres ver más imágenes del mismo? "
            "Responde con sí, no o ver más imágenes."
        )
        state = _with_user_message(state, "Antes quiero ver el modelo nissan versa")

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
                return_value={
                    "images": ["/img/versa-1.jpg", "/img/versa-2.jpg"],
                    "nextCursor": 2,
                    "hasMore": True,
                    "mode": "top",
                },
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertEqual(updated.get("selected_vehicle_id"), "veh-versa")
        self.assertEqual(updated.get("selected_car"), "Nissan Versa 2004")
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        assistant_texts = [
            str(m.get("content", "")) for m in updated.get("messages", []) if m.get("role") == "assistant"
        ]
        joined = "\n".join(assistant_texts)
        self.assertIn("Detalle del vehiculo:", joined)
        self.assertIn("**Marca**: Nissan", joined)
        self.assertIn("/img/versa-1.jpg", joined)

    def test_vehicle_detail_without_images_uses_no_images_copy(self) -> None:
        vehicles = [
            {
                "id": "veh-1",
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
        ]

        state = _with_user_message(_initial_state(), "hola tienes un nissan versa")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.search_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=vehicles[0]),
            patch("src.nodes.car_selection.generate_vehicle_detail_intro", return_value="Detalle del vehiculo:"),
            patch("src.nodes.car_selection.fetch_vehicle_images", return_value={"images": [], "hasMore": False, "mode": "top"}),
            patch("src.nodes.car_selection.safe_llm_format", side_effect=lambda text: text),
        ):
            updated = self.graph.invoke(state)

        assistant_messages = [msg.get("content", "") for msg in updated.get("messages", []) if msg.get("role") == "assistant"]
        self.assertGreaterEqual(len(assistant_messages), 3)
        self.assertIn("Lamentablemente no tenemos imagenes de este vehiculo", assistant_messages[-2])
        self.assertIn("¿Te interesa comprar este vehículo ? 🚗✨", assistant_messages[-1])
        self.assertNotIn("ver más imágenes", assistant_messages[-1].lower())

    def test_more_images_reply_does_not_route_to_faq_when_awaiting_confirmation(self) -> None:
        state = _initial_state()
        state["current_node"] = "car_selection"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Dodge Ram 2015"
        state["selected_vehicle_id"] = "veh-ram"
        state["awaiting_purchase_confirmation"] = True
        state["vehicle_images_cursor"] = 5
        state["vehicle_images_has_more"] = False
        state["last_bot_message"] = "Estas son todas las imagenes disponibles de este vehiculo."
        state = _with_user_message(state, "mas imagenes")

        vehicles = [{"id": "veh-ram", "brand": "Dodge", "model": "Ram", "year": 2015, "status": "available"}]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.classify_purchase_confirmation_intent", return_value="VER_MAS_IMAGENES"),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertFalse(updated.get("is_faq_interrupt"))
        self.assertIn("Ya no hay mas imagenes", updated["messages"][-1]["content"])


if __name__ == "__main__":
    unittest.main()
