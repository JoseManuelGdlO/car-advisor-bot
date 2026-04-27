from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class FaqFlowTests(GraphTestCase):
    def test_faq_message_routes_to_faq_node(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["messages"] = [
            {"role": "assistant", "content": "¿Te interesa comprar este vehículo o prefieres ver más imágenes?", "type": "AIMessage"}
        ]
        state = with_user_message(state, "hola donde se encuentran ubicados?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": True}),
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["Estamos en Av. Siempre Viva 123."]),
            patch("src.nodes.faq.generate_faq_response", return_value="Estamos en Av. Siempre Viva 123."),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertFalse(updated.get("is_faq_interrupt"))
        self.assertIn("Siempre Viva 123", updated["messages"][-1]["content"])

    def test_faq_interrupt_resumes_lead_capture_next_turn(self) -> None:
        state = initial_state()
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

        faq_turn = with_user_message(state, "donde se ubican?")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": True}),
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["Estamos en Centro."]),
            patch("src.nodes.faq.generate_faq_response", return_value="Estamos en Centro."),
        ):
            after_faq = self.graph.invoke(faq_turn)

        self.assertEqual(after_faq.get("current_node"), "lead_capture")
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
            {"role": "assistant", "content": "Para contactarte con un asesor, cual es tu nombre completo?", "type": "AIMessage"},
            {"role": "user", "content": "Juan Pérez", "type": "HumanMessage"},
        ]
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.lead_capture.safe_llm_format", side_effect=lambda text: text),
        ):
            resumed = self.graph.invoke(resume_state)

        self.assertEqual(resumed.get("current_node"), "lead_capture")
        self.assertIn("correo", resumed["messages"][-1]["content"].lower())

