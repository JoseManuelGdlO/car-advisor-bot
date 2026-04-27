from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class VehicleCatalogFlowTests(GraphTestCase):
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

        state = with_user_message(initial_state(), "hola tienen nissan versa")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.search_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=vehicles[0]),
            patch("src.nodes.car_selection.generate_vehicle_detail_intro", return_value="Detalle del vehiculo:"),
            patch(
                "src.nodes.car_selection.fetch_vehicle_images",
                return_value={"images": ["/img/1.jpg", "/img/2.jpg"], "nextCursor": 2, "hasMore": True, "mode": "top"},
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertEqual(updated.get("selected_vehicle_id"), "veh-1")
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        assistant_texts = [str(m.get("content", "")) for m in updated.get("messages", []) if m.get("role") == "assistant"]
        joined = "\n".join(assistant_texts)
        self.assertIn("Detalle del vehiculo:", joined)
        self.assertIn("**Marca**: Nissan", joined)

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
        state = with_user_message(initial_state(), "hola tienen nissan versa")
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
                return_value={"images": ["/img/1.jpg", "/img/2.jpg"], "nextCursor": 2, "hasMore": True, "mode": "top"},
            ),
        ):
            updated = self.graph.invoke(state)

        assistant_texts = [str(m.get("content", "")) for m in updated.get("messages", []) if m.get("role") == "assistant"]
        joined = "\n".join(assistant_texts)
        self.assertIn("*Marca*: Nissan", joined)
        self.assertNotIn("**Marca**: Nissan", joined)

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

        state = with_user_message(initial_state(), "hola tienes un nissan versa")
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

    def test_multiturn_greeting_models_selection_and_model_details_flow(self) -> None:
        versa_2011 = {
            "id": "veh-versa-2011",
            "brand": "Nissan",
            "model": "Versa",
            "year": 2011,
            "status": "available",
            "price": 3000000,
            "km": 0,
            "transmission": "si",
            "engine": "si",
            "color": "verde",
            "description": "Barato pa que salga",
        }
        versa_2001 = {
            "id": "veh-versa-2001",
            "brand": "Nissan",
            "model": "Versa",
            "year": 2001,
            "status": "available",
            "price": 1200000,
            "km": 90000,
            "transmission": "manual",
            "engine": "1.6",
            "color": "gris",
            "description": "",
        }
        vehicles = [versa_2011, versa_2001]
        state = initial_state()

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.generate_other_response", return_value="Hola, te ayudo con los modelos disponibles."),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.search_vehicles", side_effect=[[versa_2011, versa_2001], [versa_2011]]),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=versa_2011),
            patch("src.nodes.car_selection.generate_vehicle_candidates_selection_message", return_value="1. Nissan Versa 2011\n2. Nissan Versa 2001"),
            patch("src.nodes.car_selection.generate_vehicle_detail_intro", return_value="Aqui tienes la informacion completa del Nissan Versa 2011."),
            patch(
                "src.nodes.car_selection.fetch_vehicle_images",
                return_value={"images": ["/img/versa-2011-1.jpg"], "nextCursor": 1, "hasMore": False, "mode": "top"},
            ),
            patch("src.nodes.car_selection.safe_llm_format", side_effect=lambda text: text),
        ):
            state = self.graph.invoke(with_user_message(state, "hola"))
            self.assertEqual(state.get("intent"), "other")

            state = self.graph.invoke(with_user_message(state, "quiero ver modelos versa"))
            self.assertEqual(state.get("current_node"), "car_selection")
            self.assertEqual(len(state.get("last_vehicle_candidates", [])), 2)

            state = self.graph.invoke(with_user_message(state, "selecciono el nissan versa 2011"))
            self.assertEqual(state.get("selected_vehicle_id"), "veh-versa-2011")
            self.assertTrue(state.get("awaiting_purchase_confirmation"))

            state = self.graph.invoke(with_user_message(state, "dame los datos del modelo"))
            self.assertEqual(state.get("selected_vehicle_id"), "veh-versa-2011")
            self.assertTrue(state.get("awaiting_purchase_confirmation"))

