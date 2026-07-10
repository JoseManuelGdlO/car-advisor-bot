"""Tests del flujo de bienvenida y captura de nombre."""

from __future__ import annotations

from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message


def _onboarding_greeting_flags() -> dict[str, bool]:
    return {"tiene_intencion_comercial": False}


def _onboarding_commercial_flags() -> dict[str, bool]:
    return {"tiene_intencion_comercial": True}


class CustomerOnboardingTests(GraphTestCase):
    def test_first_message_with_catalog_intent_stores_pending(self) -> None:
        state = with_user_message(
            initial_state(),
            "hola que tal quiero ver los modelos disponibles",
        )
        state["customer_info"] = {}
        state["onboarding_greeting_done"] = False

        with (
            patch(
                "src.nodes.customer_onboarding.generate_welcome_and_name_request",
                return_value="¡Hola! ¿Cómo te llamas?",
            ),
            patch(
                "src.nodes.customer_onboarding.classify_onboarding_first_message",
                return_value=_onboarding_commercial_flags(),
            ),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(
            updated.get("pending_onboarding_user_message"),
            "hola que tal quiero ver los modelos disponibles",
        )
        self.assertTrue(updated.get("awaiting_customer_name"))

    def test_first_message_without_name_asks_for_name(self) -> None:
        state = with_user_message(initial_state(), "hola")
        state["customer_info"] = {}
        state["onboarding_greeting_done"] = False

        with (
            patch(
                "src.nodes.customer_onboarding.generate_welcome_and_name_request",
                return_value="Bienvenido. ¿Cómo te llamas?",
            ),
            patch(
                "src.nodes.customer_onboarding.classify_onboarding_first_message",
                return_value=_onboarding_greeting_flags(),
            ),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
        ):
            updated = self.graph.invoke(state)

        self.assertTrue(updated.get("awaiting_customer_name"))
        self.assertFalse(updated.get("onboarding_greeting_done"))
        self.assertEqual(updated.get("current_node"), "customer_onboarding")
        last_msg = updated["messages"][-1]["content"]
        self.assertIn("¿Cómo te llamas?", last_msg)

    def test_second_message_captures_name_and_persists(self) -> None:
        state = with_user_message(initial_state(), "me llamo Juan")
        state["awaiting_customer_name"] = True
        state["onboarding_greeting_done"] = False
        state["user_id"] = "5512345678"
        state["platform"] = "web"
        state["messages"] = [
            {"role": "user", "content": "hola", "type": "HumanMessage"},
            {
                "role": "assistant",
                "content": "Bienvenido. ¿Cómo te llamas?",
                "type": "AIMessage",
            },
            {"role": "user", "content": "me llamo Juan", "type": "HumanMessage"},
        ]
        state["last_bot_message"] = "Bienvenido. ¿Cómo te llamas?"

        with (
            patch(
                "src.nodes.customer_onboarding.extract_customer_name",
                return_value={"nombre": "Juan", "is_refusal": False},
            ),
            patch("src.nodes.customer_onboarding.sync_customer_info_to_backend") as sync_mock,
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("customer_info", {}).get("nombre"), "Juan")
        self.assertFalse(updated.get("awaiting_customer_name"))
        self.assertTrue(updated.get("onboarding_greeting_done"))
        sync_mock.assert_called_once()
        self.assertIn("Mucho gusto, Juan", updated["messages"][-1]["content"])
        self.assertIn("¿En qué te puedo ayudar hoy?", updated["messages"][-1]["content"])

    def test_name_capture_with_commercial_intent_in_same_message_resumes_flow(self) -> None:
        state = initial_state()
        state["customer_info"] = {}
        state["onboarding_greeting_done"] = False
        state["awaiting_customer_name"] = True
        state["messages"] = [
            {"role": "user", "content": "hola que tal", "type": "HumanMessage"},
            {
                "role": "assistant",
                "content": "Bienvenido. ¿Cómo te llamas?",
                "type": "AIMessage",
            },
            {
                "role": "user",
                "content": "Con Javier Karim, me puedes dar informacion del suzuki swift",
                "type": "HumanMessage",
            },
        ]
        state["last_bot_message"] = "Bienvenido. ¿Cómo te llamas?"

        with (
            patch(
                "src.nodes.customer_onboarding.extract_customer_name",
                return_value={
                    "nombre": "Javier Karim",
                    "is_refusal": False,
                    "mensaje_restante": "me puedes dar informacion del suzuki swift",
                },
            ),
            patch(
                "src.nodes.customer_onboarding.classify_onboarding_first_message",
                return_value=_onboarding_commercial_flags(),
            ),
            patch("src.nodes.customer_onboarding.sync_customer_info_to_backend"),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[]),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw.get("fallback", ""),
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("customer_info", {}).get("nombre"), "Javier Karim")
        self.assertFalse(updated.get("awaiting_customer_name"))
        self.assertTrue(updated.get("onboarding_greeting_done"))
        assistant_texts = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertTrue(any("Mucho gusto, Javier Karim" in text for text in assistant_texts))
        self.assertEqual(updated.get("current_node"), "car_selection")

    def test_greeting_without_name_proceeds_to_help_offer(self) -> None:
        state = with_user_message(initial_state(), "hola buenos dias")
        state["customer_info"] = {}
        state["awaiting_customer_name"] = True
        state["onboarding_greeting_done"] = False
        state["messages"] = [
            {"role": "user", "content": "hola", "type": "HumanMessage"},
            {
                "role": "assistant",
                "content": "Bienvenido. ¿Cómo te llamas?",
                "type": "AIMessage",
            },
            {"role": "user", "content": "hola buenos dias", "type": "HumanMessage"},
        ]
        state["last_bot_message"] = "Bienvenido. ¿Cómo te llamas?"

        with (
            patch(
                "src.nodes.customer_onboarding.extract_customer_name",
                return_value={"nombre": None, "is_refusal": False},
            ),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
        ):
            updated = self.graph.invoke(state)

        self.assertFalse(updated.get("awaiting_customer_name"))
        self.assertTrue(updated.get("onboarding_greeting_done"))
        self.assertTrue(updated.get("onboarding_turn_complete"))
        self.assertNotIn("nombre", updated.get("customer_info", {}))
        self.assertIn("¿En qué te puedo ayudar hoy?", updated["messages"][-1]["content"])

    def test_commercial_intent_without_name_resumes_pending_flow(self) -> None:
        state = initial_state()
        state["customer_info"] = {}
        state["onboarding_greeting_done"] = False
        state["awaiting_customer_name"] = True
        state["pending_onboarding_user_message"] = "quiero informacion del suzuki jimny"
        state["messages"] = [
            {"role": "user", "content": "quiero informacion del suzuki jimny", "type": "HumanMessage"},
            {
                "role": "assistant",
                "content": "¡Hola! ¿Cómo te llamas?",
                "type": "AIMessage",
            },
            {"role": "user", "content": "prefiero no decir", "type": "HumanMessage"},
        ]
        state["last_bot_message"] = "¡Hola! ¿Cómo te llamas?"

        with (
            patch(
                "src.nodes.customer_onboarding.extract_customer_name",
                return_value={"nombre": None, "is_refusal": True},
            ),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[]),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw.get("fallback", ""),
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertFalse(updated.get("awaiting_customer_name"))
        self.assertTrue(updated.get("onboarding_greeting_done"))
        self.assertNotIn("nombre", updated.get("customer_info", {}))
        assistant_texts = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertTrue(any("Con gusto te ayudo" in text for text in assistant_texts))

    def test_name_capture_resumes_pending_catalog_flow(self) -> None:
        state = initial_state()
        state["customer_info"] = {}
        state["onboarding_greeting_done"] = False
        state["awaiting_customer_name"] = True
        state["pending_onboarding_user_message"] = "hola que tal quiero ver los modelos disponibles"
        state["messages"] = [
            {"role": "user", "content": "hola que tal quiero ver los modelos disponibles", "type": "HumanMessage"},
            {
                "role": "assistant",
                "content": "¡Hola! ¿Cómo te llamas?",
                "type": "AIMessage",
            },
            {"role": "user", "content": "Javier", "type": "HumanMessage"},
        ]
        state["last_bot_message"] = "¡Hola! ¿Cómo te llamas?"

        with (
            patch(
                "src.nodes.customer_onboarding.extract_customer_name",
                return_value={"nombre": "Javier", "is_refusal": False},
            ),
            patch("src.nodes.customer_onboarding.sync_customer_info_to_backend"),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[]),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw.get("fallback", ""),
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("customer_info", {}).get("nombre"), "Javier")
        self.assertEqual(updated.get("current_node"), "car_selection")
        assistant_texts = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertTrue(any("Mucho gusto, Javier" in text for text in assistant_texts))

    def test_first_message_with_known_name_personalizes_welcome(self) -> None:
        state = with_user_message(initial_state(), "hola")
        state["customer_info"] = {"nombre": "Ana"}
        state["onboarding_greeting_done"] = False

        with (
            patch(
                "src.nodes.customer_onboarding.generate_welcome_with_known_name",
                return_value="¡Hola Ana! Bienvenida a la agencia.",
            ) as welcome_mock,
            patch(
                "src.nodes.customer_onboarding.classify_onboarding_first_message",
                return_value=_onboarding_greeting_flags(),
            ),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
        ):
            updated = self.graph.invoke(state)

        welcome_mock.assert_called_once()
        self.assertTrue(updated.get("onboarding_greeting_done"))
        self.assertIn("Ana", updated["messages"][-1]["content"])

    def test_known_name_buena_tarde_ends_turn_without_router_reply(self) -> None:
        state = with_user_message(initial_state(), "buena tarde")
        state["customer_info"] = {"nombre": "Javier Reyes"}
        state["onboarding_greeting_done"] = False

        with (
            patch(
                "src.nodes.customer_onboarding.generate_welcome_with_known_name",
                return_value="¡Hola Javier! ¿En qué te puedo ayudar?",
            ),
            patch(
                "src.nodes.customer_onboarding.classify_onboarding_first_message",
                return_value=_onboarding_greeting_flags(),
            ),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.generate_other_response") as other_mock,
        ):
            updated = self.graph.invoke(state)

        self.assertTrue(updated.get("onboarding_turn_complete"))
        other_mock.assert_not_called()
        assistant_messages = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertEqual(len(assistant_messages), 1)
        self.assertIn("Javier", assistant_messages[0])

    def test_known_name_compound_greeting_ends_turn_without_router_reply(self) -> None:
        state = with_user_message(initial_state(), "hola buenas tardes")
        state["customer_info"] = {"nombre": "Javier"}
        state["onboarding_greeting_done"] = False

        with (
            patch(
                "src.nodes.customer_onboarding.generate_welcome_with_known_name",
                return_value="¡Hola Javier! Bienvenido a la agencia.",
            ),
            patch(
                "src.nodes.customer_onboarding.classify_onboarding_first_message",
                return_value=_onboarding_greeting_flags(),
            ),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.generate_other_response") as other_mock,
        ):
            updated = self.graph.invoke(state)

        self.assertTrue(updated.get("onboarding_turn_complete"))
        other_mock.assert_not_called()
        assistant_messages = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertEqual(len(assistant_messages), 1)
        self.assertIn("Javier", assistant_messages[0])

    def test_returning_customer_greeting_only_gets_welcome_back(self) -> None:
        state = with_user_message(initial_state(), "Hola, buenas tardes")
        state["customer_info"] = {"nombre": "Vanessa Castrellón"}
        state["onboarding_greeting_done"] = True
        state["messages"] = [
            {"role": "user", "content": "Hola, buenas tardes", "type": "HumanMessage"},
        ]

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.generate_other_response") as other_mock,
        ):
            updated = self.graph.invoke(state)

        self.assertTrue(updated.get("onboarding_turn_complete"))
        other_mock.assert_not_called()
        assistant_messages = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertEqual(len(assistant_messages), 1)
        self.assertIn("Vanessa Castrellón", assistant_messages[0])
        self.assertIn("¿En qué te ayudo?", assistant_messages[0])

    def test_returning_customer_commercial_message_still_routes(self) -> None:
        state = with_user_message(initial_state(), "hola quiero ver SUVs")
        state["customer_info"] = {"nombre": "Vanessa Castrellón"}
        state["onboarding_greeting_done"] = True
        state["messages"] = [
            {"role": "user", "content": "hola quiero ver SUVs", "type": "HumanMessage"},
        ]

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[]),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw.get("fallback", ""),
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        assistant_messages = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertFalse(any("Hola de nuevo" in text for text in assistant_messages))

    def test_subsequent_turn_skips_onboarding_greeting(self) -> None:
        state = with_user_message(initial_state(), "que carros tienes")
        state["customer_info"] = {"nombre": "Luis"}
        state["onboarding_greeting_done"] = True
        state["messages"] = [
            {"role": "user", "content": "hola", "type": "HumanMessage"},
            {"role": "assistant", "content": "Hola Luis", "type": "AIMessage"},
            {"role": "user", "content": "que carros tienes", "type": "HumanMessage"},
        ]

        with (
            patch(
                "src.nodes.customer_onboarding.generate_welcome_with_known_name",
            ) as welcome_mock,
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[]),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw.get("fallback", ""),
            ),
        ):
            updated = self.graph.invoke(state)

        welcome_mock.assert_not_called()
        self.assertEqual(updated.get("current_node"), "car_selection")

    def test_extract_customer_name_uses_llm(self) -> None:
        from src.services.llm_responses import extract_customer_name

        mock_llm = patch("src.services.llm_responses.ChatOpenAI")
        with mock_llm as chat_cls:
            chat_cls.return_value.invoke.return_value.content = (
                '{"nombre": "Pedro", "is_refusal": false, "mensaje_restante": null}'
            )
            with patch("src.services.llm_responses.get_bot_settings", return_value={}):
                result = extract_customer_name("¿Cómo te llamas?", "soy Pedro")

        self.assertEqual(result["nombre"], "Pedro")
        chat_cls.return_value.invoke.assert_called_once()

    def test_heuristic_message_without_name_strips_name_and_prefix(self) -> None:
        from src.services.llm_responses import _heuristic_message_without_name

        remainder = _heuristic_message_without_name(
            "Con Javier Karim, me puedes dar informacion del suzuki swift",
            "Javier Karim",
        )
        self.assertEqual(remainder, "me puedes dar informacion del suzuki swift")

    def test_classify_onboarding_first_message_uses_llm(self) -> None:
        from src.services.llm_responses import classify_onboarding_first_message

        mock_llm = patch("src.services.llm_responses.ChatOpenAI")
        with mock_llm as chat_cls:
            chat_cls.return_value.invoke.return_value.content = '{"tiene_intencion_comercial": true}'
            with patch("src.services.llm_responses.get_bot_settings", return_value={}):
                result = classify_onboarding_first_message("hola quiero ver modelos")

        self.assertTrue(result["tiene_intencion_comercial"])
        chat_cls.return_value.invoke.assert_called_once()

    def test_classify_onboarding_first_message_fallback_on_llm_failure(self) -> None:
        from src.services.llm_responses import classify_onboarding_first_message

        with (
            patch("src.services.llm_responses.ChatOpenAI", side_effect=RuntimeError("llm down")),
            patch("src.services.llm_responses.get_bot_settings", return_value={}),
        ):
            greeting = classify_onboarding_first_message("buena tarde")
            commercial = classify_onboarding_first_message("hola quiero ver modelos")

        self.assertFalse(greeting["tiene_intencion_comercial"])
        self.assertTrue(commercial["tiene_intencion_comercial"])
