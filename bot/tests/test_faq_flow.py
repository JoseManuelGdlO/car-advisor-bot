from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class FaqFlowTests(GraphTestCase):
    def test_faq_message_routes_to_faq_node(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["messages"] = [
            {
                "role": "assistant",
                "content": (
                    "¿Te interesa agendar una prueba de manejo o ver este vehículo en persona? "
                    "También puedes pedir ver más imágenes."
                ),
                "type": "AIMessage",
            }
        ]
        state = with_user_message(state, "hola donde se encuentran ubicados?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": True}),
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["Estamos en Av. Siempre Viva 123."]),
            patch("src.nodes.faq.generate_faq_resume_transition", return_value="¿Seguimos con la selección?"),
            patch("src.nodes.faq.generate_faq_user_turn", return_value="Estamos en Av. Siempre Viva 123."),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertEqual(updated.get("intent"), "vehicle_catalog")
        self.assertFalse(updated.get("is_faq_interrupt"))
        self.assertIn("Siempre Viva 123", updated["messages"][-1]["content"])

    def test_faq_interrupt_resumes_lead_capture_next_turn(self) -> None:
        state = initial_state()
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Para agendar Nissan Versa 2004 usa el enlace de calendario.",
                "type": "AIMessage",
            }
        ]
        state["current_node"] = "lead_capture"
        state["intent"] = "vehicle_catalog"
        state["selected_car"] = "Nissan Versa 2004"
        state["selected_vehicle_id"] = "veh-1"
        state["last_bot_message"] = state["messages"][-1]["content"]

        faq_turn = with_user_message(state, "donde se ubican?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": True}),
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["Estamos en Centro."]),
            patch("src.nodes.faq.generate_faq_resume_transition", return_value="¿Seguimos con tus datos?"),
            patch("src.nodes.faq.generate_faq_user_turn", return_value="Estamos en Centro."),
        ):
            after_faq = self.graph.invoke(faq_turn)

        self.assertEqual(after_faq.get("current_node"), "lead_capture")
        self.assertEqual(after_faq.get("intent"), "other")
        self.assertFalse(after_faq.get("is_faq_interrupt"))
        self.assertFalse(after_faq.get("skip_lead_prompt"))

        resume_state = initial_state()
        resume_state["current_node"] = "lead_capture"
        resume_state["intent"] = "vehicle_catalog"
        resume_state["selected_car"] = "Nissan Versa 2004"
        resume_state["selected_vehicle_id"] = "veh-1"
        resume_state["platform"] = "web"
        resume_state["user_id"] = "5512345678"
        resume_state["messages"] = [
            {"role": "assistant", "content": "Estamos en Centro.", "type": "AIMessage"},
            {"role": "user", "content": "donde se ubican?", "type": "HumanMessage"},
        ]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch(
                "src.nodes.lead_capture.generate_lead_capture_scheduling_message",
                return_value=(
                    "Agenda Nissan Versa 2004 en "
                    "https://calendar.app.google/tYniJNfcrd8qXvut8"
                ),
            ),
            patch("src.nodes.lead_capture.notify_advisor"),
            patch("src.nodes.lead_capture.push_event_to_backend"),
            patch("src.nodes.lead_capture.deactivate_bot", side_effect=lambda s, **_: {**s, "bot_disabled": True}),
        ):
            resumed = self.graph.invoke(resume_state)

        self.assertEqual(resumed.get("current_node"), "router")
        self.assertTrue(resumed.get("lead_capture_done"))
        self.assertIn("calendar.app.google", resumed["messages"][-1]["content"])

    def test_faq_non_interrupt_sets_intent_other(self) -> None:
        state = initial_state()
        state = with_user_message(state, "donde esta la ubicacion del taller?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="FAQ"),
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["Calle Falsa 123."]),
            patch("src.nodes.faq.generate_faq_user_turn", return_value="Calle Falsa 123."),
        ):
            updated = self.graph.invoke(state)
        self.assertEqual(updated.get("intent"), "other")
        self.assertEqual(updated.get("current_node"), "router")
        self.assertIn("Falsa 123", updated["messages"][-1]["content"])

    def test_followup_after_faq_routes_per_llm_classifier(self) -> None:
        """Tras FAQ standalone, el siguiente turno sigue la etiqueta del clasificador LLM."""
        state = initial_state()
        state = with_user_message(state, "donde estan ubicados?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="FAQ"),
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["REX."]),
            patch("src.nodes.faq.generate_faq_user_turn", return_value="Estamos por REX."),
        ):
            after_location = self.graph.invoke(state)

        vehicles = [
            {"id": "veh-1", "brand": "Toyota", "model": "Corolla", "year": 2020, "status": "available"},
            {"id": "veh-2", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"},
        ]
        state_catalog = with_user_message(after_location, "de cuales manejas?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=vehicles),
        ):
            catalog_turn = self.graph.invoke(state_catalog)

        self.assertEqual(catalog_turn.get("current_node"), "car_selection")
        catalog_answer = str(catalog_turn["messages"][-1]["content"])
        self.assertIn("Para mandarte la ficha correcta, dime qué modelo te interesa:", catalog_answer)
        self.assertIn("Toyota", catalog_answer)
        self.assertIn("Corolla", catalog_answer)

        state_faq = with_user_message(after_location, "de cuales manejas?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="FAQ"),
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["Tenemos varias marcas."]),
            patch("src.nodes.faq.generate_faq_user_turn", return_value="Tenemos varias marcas."),
        ):
            faq_turn = self.graph.invoke(state_faq)

        self.assertEqual(faq_turn.get("current_node"), "router")
        self.assertEqual(faq_turn.get("intent"), "other")
        self.assertIn("varias marcas", faq_turn["messages"][-1]["content"])

