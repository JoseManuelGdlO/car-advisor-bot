"""Integración del grafo: catálogo, detalle de vehículo, imágenes, filtros por precio y promociones desde el inicio.

Los tests parchean LLM/red (`classify_router_intent`, `classify_faq_interrupt_flags`) y APIs de vehículos
para respuestas deterministas.
"""

from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class VehicleCatalogFlowTests(GraphTestCase):
    def test_unavailable_model_question_answer_first_when_router_vehicle_catalog(self) -> None:
        """Pregunta híbrida sobre modelo: answer-first en car_selection si el clasificador elige catálogo."""
        vehicles = [
            {"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"},
            {"id": "veh-2", "brand": "Dodge", "model": "Ram", "year": 2015, "status": "available"},
        ]
        state = with_user_message(initial_state(), "el mazda 3 sirve para ciudad o carretera?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: (
                    "No tengo ficha tecnica suficiente para confirmarlo con precision.\n\n"
                    + str(kw.get("fallback", ""))
                ),
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        answer = str(updated["messages"][-1]["content"])
        self.assertIn("No tengo ficha tecnica suficiente", answer)
        self.assertIn("Nissan", answer)
        self.assertIn("Dodge", answer)

    def test_unavailable_model_question_routes_to_faq_when_router_faq(self) -> None:
        """Si el clasificador elige FAQ, la pregunta va al nodo faq (sin answer-first de catálogo)."""
        state = with_user_message(initial_state(), "el mazda 3 sirve para ciudad o carretera?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="FAQ"),
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["No manejamos Mazda en inventario."]),
            patch(
                "src.nodes.faq.generate_faq_user_turn",
                return_value="No manejamos Mazda en inventario.",
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "router")
        self.assertEqual(updated.get("intent"), "other")
        self.assertIn("Mazda", updated["messages"][-1]["content"])

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
                ):
                    updated = self.graph.invoke(state)

                self.assertEqual(updated.get("current_node"), "car_selection")
                self.assertEqual(updated.get("selected_vehicle_id"), "veh-1")
                self.assertTrue(updated.get("awaiting_purchase_confirmation"))
                assistant_texts = [str(m.get("content", "")) for m in updated.get("messages", []) if m.get("role") == "assistant"]
                joined = "\n".join(assistant_texts)
                self.assertIn("Detalle del vehiculo:", joined)
                self.assertIn("Nissan Versa", joined)
                self.assertNotIn("/img/1.jpg", joined)

    def test_vehicle_detail_without_images_on_request_uses_no_images_copy(self) -> None:
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
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
            patch(
                "src.nodes.car_selection.generate_vehicle_purchase_question",
                return_value="¿Te interesa agendar una prueba de manejo o ver este vehículo en persona? 🚗✨",
            ),
        ):
            updated = self.graph.invoke(state)

        assistant_messages = [msg.get("content", "") for msg in updated.get("messages", []) if msg.get("role") == "assistant"]
        joined = "\n".join(assistant_messages)
        self.assertNotIn("Lamentablemente no tenemos imagenes de este vehiculo", joined)

        state = with_user_message(updated, "muestrame fotos del versa")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch(
                "src.utils.vehicle_images.fetch_vehicle_images",
                return_value={"images": [], "hasMore": False, "mode": "top"},
            ),
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
        ):
            updated = self.graph.invoke(state)

        assistant_messages = [msg.get("content", "") for msg in updated.get("messages", []) if msg.get("role") == "assistant"]
        last_msg = assistant_messages[-1].lower()
        self.assertIn("no tenemos", last_msg)
        self.assertTrue("im" in last_msg and ("agen" in last_msg or "ágen" in last_msg))

    def test_first_images_request_after_detail_sends_batch(self) -> None:
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
        state = initial_state()
        state["current_node"] = "car_selection"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["awaiting_purchase_confirmation"] = True
        state = with_user_message(state, "muestrame fotos")

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
                return_value={"images": ["/img/1.jpg", "/img/2.jpg"], "nextCursor": 2, "hasMore": True, "mode": "top"},
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("vehicle_images_last_batch"), ["/img/1.jpg", "/img/2.jpg"])
        self.assertIn("/img/1.jpg", updated["messages"][-1]["content"])

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
        state["last_bot_message"] = (
            "¿Te interesa agendar una prueba de manejo o ver este vehículo en persona? "
            "También puedes pedir ver más imágenes del mismo. 🚗✨"
        )
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
                    "ask_images": False,
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
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("selected_vehicle_id"), "veh-versa")
        # Al encontrar un match único se muestra detalle del nuevo vehículo y se vuelve
        # a esperar confirmación de compra para esa unidad.
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        mocked_search.assert_called_once_with({"minPrice": 100000, "maxPrice": 200000})

    def test_requirement_search_filters_by_description_platform(self) -> None:
        platform_car = {
            "id": "veh-swift",
            "brand": "Suzuki",
            "model": "Swift",
            "year": 2026,
            "status": "available",
            "price": 300000,
            "description": "El carro ideal para plataformas como uber o diddi",
        }
        other = {
            "id": "veh-jimny",
            "brand": "Suzuki",
            "model": "Jimny",
            "year": 2027,
            "status": "available",
            "price": 450000,
            "description": "SUV compacto para aventura",
        }
        vehicles = [platform_car, other]
        state = with_user_message(initial_state(), "tienes carros para plataforma?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.detect_vehicle_filters", return_value={}),
            patch(
                "src.nodes.car_selection.classify_vehicle_requirement_matches",
                return_value={
                    "is_requirement_search": True,
                    "matched_vehicles": [platform_car],
                    "criterion_summary": "apto para plataforma uber/didi",
                },
            ) as mocked_requirement,
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=platform_car),
            patch(
                "src.nodes.car_selection.generate_vehicle_detail_conversation",
                return_value="El Suzuki Swift es ideal para plataformas.",
            ),
            patch("src.nodes.car_selection.search_vehicles") as mocked_search,
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("selected_vehicle_id"), "veh-swift")
        self.assertIn("Swift", str(updated.get("selected_car", "")))
        mocked_requirement.assert_called_once()
        mocked_search.assert_not_called()
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))

    def test_requirement_search_filters_by_passengers_metadata(self) -> None:
        five_seater = {
            "id": "veh-ertiga",
            "brand": "Suzuki",
            "model": "Ertiga",
            "year": 2026,
            "status": "available",
            "metadata": {"passengers": 7},
            "description": "Familiar amplio",
        }
        two_seater = {
            "id": "veh-sport",
            "brand": "Suzuki",
            "model": "Swift Sport",
            "year": 2025,
            "status": "available",
            "metadata": {"passengers": 4},
            "description": "Deportivo urbano",
        }
        vehicles = [five_seater, two_seater]
        state = with_user_message(initial_state(), "tienes carros para 5 pasajeros o mas?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.detect_vehicle_filters", return_value={}),
            patch(
                "src.nodes.car_selection.classify_vehicle_requirement_matches",
                return_value={
                    "is_requirement_search": True,
                    "matched_vehicles": [five_seater],
                    "criterion_summary": "5 pasajeros o mas",
                },
            ),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=five_seater),
            patch(
                "src.nodes.car_selection.generate_vehicle_detail_conversation",
                return_value="El Ertiga acomoda bien a 5 o mas pasajeros.",
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("selected_vehicle_id"), "veh-ertiga")
        self.assertIn("Ertiga", str(updated.get("selected_car", "")))
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))

    def test_requirement_search_no_matches_lists_available_directly(self) -> None:
        vehicles = [
            {
                "id": "veh-1",
                "brand": "Nissan",
                "model": "Versa",
                "year": 2011,
                "status": "available",
                "description": "Sedan urbano",
            },
            {
                "id": "veh-2",
                "brand": "Dodge",
                "model": "Ram",
                "year": 2015,
                "status": "available",
                "description": "Pickup de trabajo",
            },
        ]
        state = with_user_message(initial_state(), "tienes carros electricos?")
        captured: dict[str, str] = {}

        def _capture_verified(**kwargs):
            captured["facts"] = str(kwargs.get("verified_facts_block", ""))
            return "No hay electricos; estos son los disponibles.\n\n" + str(kwargs.get("fallback", ""))

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.detect_vehicle_filters", return_value={}),
            patch(
                "src.nodes.car_selection.classify_vehicle_requirement_matches",
                return_value={
                    "is_requirement_search": True,
                    "matched_vehicles": [],
                    "criterion_summary": "vehiculos electricos",
                },
            ),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=_capture_verified,
            ),
        ):
            updated = self.graph.invoke(state)

        answer = str(updated["messages"][-1]["content"])
        self.assertIn("Nissan", answer)
        self.assertIn("Dodge", answer)
        self.assertIn("criterio_sin_coincidencias: vehiculos electricos", captured.get("facts", ""))
        self.assertNotIn("quieres ver todos", answer.lower())
        self.assertEqual(len(updated.get("last_vehicle_candidates", [])), 2)

    def test_price_filter_takes_priority_over_requirement_search(self) -> None:
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
            patch("src.nodes.car_selection.classify_vehicle_requirement_matches") as mocked_requirement,
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("selected_vehicle_id"), "veh-versa")
        mocked_search.assert_called_once_with({"minPrice": 100000, "maxPrice": 200000})
        mocked_requirement.assert_not_called()

    def test_cheapest_price_heuristic_selects_lowest_price_vehicle(self) -> None:
        cheap = {
            "id": "veh-versa",
            "brand": "Nissan",
            "model": "Versa",
            "year": 2011,
            "status": "available",
            "price": 120000,
        }
        expensive = {
            "id": "veh-ram",
            "brand": "Dodge",
            "model": "Ram",
            "year": 2015,
            "status": "available",
            "price": 450000,
        }
        vehicles = [expensive, cheap]
        state = with_user_message(initial_state(), "cual es el auto mas economico?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
            patch("src.nodes.car_selection.detect_vehicle_filters", return_value={}),
            patch("src.nodes.car_selection.classify_vehicle_requirement_matches") as mocked_requirement,
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=cheap),
            patch(
                "src.nodes.car_selection.generate_vehicle_detail_conversation",
                return_value="El Nissan Versa es la opcion mas economica.",
            ),
            patch("src.nodes.car_selection.search_vehicles") as mocked_search,
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("selected_vehicle_id"), "veh-versa")
        self.assertIn("Versa", str(updated.get("selected_car", "")))
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        mocked_requirement.assert_not_called()
        mocked_search.assert_not_called()

    def test_cheapest_price_heuristic_before_purchase_confirmation_classifier(self) -> None:
        cheap = {
            "id": "veh-swift",
            "brand": "Suzuki",
            "model": "Swift",
            "year": 2024,
            "status": "available",
            "price": 280000,
        }
        expensive = {
            "id": "veh-jimny",
            "brand": "Suzuki",
            "model": "Jimny",
            "year": 2025,
            "status": "available",
            "price": 420000,
        }
        state = with_user_message(initial_state(), "cual es el mas barato?")
        state["awaiting_purchase_confirmation"] = True
        state["selected_vehicle_id"] = "veh-jimny"
        state["selected_car"] = "Suzuki Jimny 2025"
        state["last_vehicle_candidates"] = [expensive, cheap]
        state["last_bot_message"] = "Te interesa comprar el Suzuki Jimny?"
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[expensive, cheap]),
            patch(
                "src.nodes.car_selection._llm_vehicle_image_flags",
                return_value={"ask_images": False, "ask_more_images": False},
            ),
            patch("src.nodes.car_selection.classify_vehicle_step_flags") as mocked_step_flags,
            patch("src.nodes.car_selection.classify_purchase_confirmation_intent") as mocked_confirm,
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=cheap),
            patch(
                "src.nodes.car_selection.generate_vehicle_detail_conversation",
                return_value="El Swift es el mas barato de la lista.",
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("selected_vehicle_id"), "veh-swift")
        mocked_step_flags.assert_not_called()
        mocked_confirm.assert_not_called()


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
            patch(
                "src.nodes.car_selection.classify_vehicle_requirement_matches",
                return_value={"is_requirement_search": False, "matched_vehicles": [], "criterion_summary": ""},
            ),
        ):
            updated = self.graph.invoke(state)
        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertIn("Nissan", str(updated["messages"][-1]["content"]))

