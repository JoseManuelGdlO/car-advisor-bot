"""Integración del grafo: catálogo, detalle de vehículo, imágenes, filtros por precio y promociones desde el inicio.

Los tests parchean LLM/red (`classify_router_intent`, `classify_faq_interrupt_flags`) y APIs de vehículos
para respuestas deterministas.
"""

from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class VehicleCatalogFlowTests(GraphTestCase):
    def test_unavailable_model_question_answer_first_with_router_variants(self) -> None:
        """Mismo contrato answer-first si el router devuelve FAQ o VEHICLE_CATALOG."""
        vehicles = [
            {"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"},
            {"id": "veh-2", "brand": "Dodge", "model": "Ram", "year": 2015, "status": "available"},
        ]
        for router_intent in ("FAQ", "VEHICLE_CATALOG"):
            with self.subTest(router_intent=router_intent):

                def verified(**kw: object) -> str:
                    base = "No tengo ficha tecnica suficiente para confirmarlo con precision."
                    extra = " Ese modelo no esta disponible.\n\n" if router_intent == "FAQ" else "\n\n"
                    return base + extra + str(kw.get("fallback", ""))

                state = with_user_message(initial_state(), "el mazda 3 sirve para ciudad o carretera?")
                with (
                    # Sin FAQ interruptiva: el flujo sigue hacia router → car_selection.
                    patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
                    patch("src.nodes.router.classify_router_intent", return_value=router_intent),
                    patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
                    patch("src.nodes.car_selection.generate_verified_user_message", side_effect=verified),
                ):
                    updated = self.graph.invoke(state)

                self.assertEqual(updated.get("current_node"), "car_selection")
                answer = str(updated["messages"][-1]["content"])
                self.assertIn("No tengo ficha tecnica suficiente", answer)
                self.assertIn("Nissan", answer)
                self.assertIn("Dodge", answer)

    def test_promotions_request_from_start_routes_to_promotions(self) -> None:
        state = with_user_message(initial_state(), "hola tienes promociones disponibles?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            # Catálogo vacío: validar solo enrutamiento a promotions y mensaje fallback.
            patch("src.nodes.promotions.fetch_promotions", return_value=[]),
            patch(
                "src.nodes.promotions.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "promotions")
        self.assertEqual(updated.get("intent"), "promotions")
        self.assertIn("No hay promociones disponibles", str(updated["messages"][-1]["content"]))

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
        for platform in ("web", "whatsapp"):
            with self.subTest(platform=platform):
                state = with_user_message(initial_state(), "hola tienen nissan versa")
                state["platform"] = platform
                with (
                    patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
                    patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
                    patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
                    patch("src.nodes.car_selection.search_vehicles", return_value=vehicles),
                    patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=vehicles[0]),
                    patch(
                        "src.nodes.car_selection.generate_vehicle_detail_conversation",
                        return_value="Detalle del vehiculo: Nissan Versa 2004, color blanco.",
                    ),
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
                self.assertIn("Nissan Versa", joined)

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
            patch(
                "src.nodes.car_selection.generate_vehicle_detail_conversation",
                return_value="Detalle del vehiculo: Nissan Versa 2004, color blanco.",
            ),
            patch("src.nodes.car_selection.fetch_vehicle_images", return_value={"images": [], "hasMore": False, "mode": "top"}),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
            patch(
                "src.nodes.car_selection.generate_vehicle_purchase_question",
                return_value="¿Te interesa comprar este vehículo ? 🚗✨",
            ),
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
            patch(
                "src.nodes.car_selection.generate_vehicle_detail_conversation",
                return_value="Aqui tienes la informacion completa del Nissan Versa 2011.",
            ),
            patch(
                "src.nodes.car_selection.fetch_vehicle_images",
                return_value={"images": ["/img/versa-2011-1.jpg"], "nextCursor": 1, "hasMore": False, "mode": "top"},
            ),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
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

    def test_price_range_only_filters_catalog_results(self) -> None:
        vehicles = [
            {"id": "veh-versa", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available", "price": 150000},
            {"id": "veh-ram", "brand": "Dodge", "model": "Ram", "year": 2015, "status": "available", "price": 450000},
        ]
        state = with_user_message(initial_state(), "quiero carros entre 100 mil y 200 mil")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.search_vehicles", return_value=[vehicles[0]]) as mocked_search,
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=vehicles[0]),
            patch(
                "src.nodes.car_selection.generate_vehicle_detail_conversation",
                return_value="Encontramos un Nissan Versa 2011 dentro de tu presupuesto.",
            ),
            patch(
                "src.nodes.car_selection.fetch_vehicle_images",
                return_value={"images": [], "nextCursor": None, "hasMore": False, "mode": "top"},
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("selected_vehicle_id"), "veh-versa")
        mocked_search.assert_called_once_with({"minPrice": 100000, "maxPrice": 200000})

    def test_wants_other_vehicles_during_confirmation_applies_filters_first(self) -> None:
        selected = {"id": "veh-selected", "brand": "Nissan", "model": "March", "year": 2018, "status": "available", "price": 210000}
        candidate = {"id": "veh-versa", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available", "price": 150000}
        vehicles = [selected, candidate]
        state = initial_state()
        state["awaiting_purchase_confirmation"] = True
        state["selected_vehicle_id"] = "veh-selected"
        state["selected_car"] = "Nissan March 2018"
        state["last_bot_message"] = "¿Te interesa comprar este vehículo o quieres ver más imágenes del mismo? 🚗✨"
        state = with_user_message(state, "quiero ver otros arriba de 100 mil y hasta 200 mil")

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch(
                "src.nodes.car_selection.classify_vehicle_step_flags",
                return_value={
                    "wants_compare_two_vehicles": False,
                    "ask_promotions": False,
                    "ask_financing": False,
                    "ask_more_images": False,
                    "wants_other_vehicles": True,
                    "confirm_purchase": False,
                    "reject_purchase": False,
                },
            ),
            patch("src.nodes.car_selection.search_vehicles", return_value=[candidate]) as mocked_search,
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=candidate),
            patch(
                "src.nodes.car_selection.generate_vehicle_detail_conversation",
                return_value="Encontramos un Nissan Versa 2011 dentro del rango solicitado.",
            ),
            patch(
                "src.nodes.car_selection.fetch_vehicle_images",
                return_value={"images": [], "nextCursor": None, "hasMore": False, "mode": "top"},
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("selected_vehicle_id"), "veh-versa")
        # Al encontrar un match único se muestra detalle del nuevo vehículo y se vuelve
        # a esperar confirmación de compra para esa unidad.
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        mocked_search.assert_called_once_with({"minPrice": 100000, "maxPrice": 200000})


class CarSelectionSmokeTests(GraphTestCase):
    """Smoke mínimo: pregunta genérica de catálogo lista inventario mockeado."""

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

