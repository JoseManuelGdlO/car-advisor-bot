from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class Flow01GreetingModelsSelectionDataTests(GraphTestCase):
    def test_flow_01_greeting_models_selection_and_data(self) -> None:
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

