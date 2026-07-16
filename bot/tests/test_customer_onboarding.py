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

    def test_sanitize_rejects_greeting_extracted_as_name(self) -> None:
        state = with_user_message(initial_state(), "Hola")
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
            {"role": "user", "content": "Hola", "type": "HumanMessage"},
        ]
        state["last_bot_message"] = "Bienvenido. ¿Cómo te llamas?"

        with (
            patch(
                "src.nodes.customer_onboarding.extract_customer_name",
                return_value={"nombre": "Hola", "is_refusal": False, "mensaje_restante": None},
            ),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
        ):
            updated = self.graph.invoke(state)

        self.assertFalse(updated.get("awaiting_customer_name"))
        self.assertNotIn("nombre", updated.get("customer_info", {}))

    def test_sanitize_rejects_generic_info_request_as_name(self) -> None:
        state = with_user_message(initial_state(), "Quiero más información")
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
            {"role": "user", "content": "Quiero más información", "type": "HumanMessage"},
        ]
        state["last_bot_message"] = "Bienvenido. ¿Cómo te llamas?"

        with (
            patch(
                "src.nodes.customer_onboarding.extract_customer_name",
                return_value={
                    "nombre": "Quiero Más Información",
                    "is_refusal": False,
                    "mensaje_restante": None,
                },
            ),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
        ):
            updated = self.graph.invoke(state)

        self.assertFalse(updated.get("awaiting_customer_name"))
        self.assertNotIn("nombre", updated.get("customer_info", {}))

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

    def test_mixed_name_and_commercial_query_registers_name_and_resumes(self) -> None:
        state = initial_state()
        state["customer_info"] = {}
        state["onboarding_greeting_done"] = False
        state["awaiting_customer_name"] = True
        state["pending_onboarding_user_message"] = "Hola! Quiero más información"
        state["messages"] = [
            {"role": "user", "content": "Hola! Quiero más información", "type": "HumanMessage"},
            {
                "role": "assistant",
                "content": "Hola, buen día. ¿En qué te puedo ayudar? ¿Con quién tengo el gusto?",
                "type": "AIMessage",
            },
            {
                "role": "user",
                "content": (
                    "Con julio cuál es el enganche para un Susuki como el del anuncio "
                    "y como quedarían los pagos"
                ),
                "type": "HumanMessage",
            },
        ]
        state["last_bot_message"] = "Hola, buen día. ¿En qué te puedo ayudar? ¿Con quién tengo el gusto?"

        with (
            patch(
                "src.nodes.customer_onboarding.extract_customer_name",
                return_value={
                    "nombre": "Julio",
                    "is_refusal": False,
                    "mensaje_restante": (
                        "cuál es el enganche para un Susuki como el del anuncio "
                        "y como quedarían los pagos"
                    ),
                },
            ),
            patch(
                "src.nodes.customer_onboarding.classify_onboarding_first_message",
                return_value=_onboarding_commercial_flags(),
            ),
            patch("src.nodes.customer_onboarding.sync_customer_info_to_backend"),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.intent_checker.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.router.classify_router_intent", return_value="FINANCING"),
            patch("src.nodes.router.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.financing.fetch_financing_plans", return_value=[]),
            patch(
                "src.nodes.financing.generate_verified_user_message",
                side_effect=lambda **kw: kw.get("fallback", ""),
            ),
            patch("src.nodes.financing.maybe_escalate_financing_detail", return_value=None),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("customer_info", {}).get("nombre"), "Julio")
        self.assertFalse(updated.get("awaiting_customer_name"))
        self.assertTrue(updated.get("onboarding_greeting_done"))
        self.assertEqual(updated.get("current_node"), "financing")
        assistant_texts = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertTrue(any("Mucho gusto, Julio" in text for text in assistant_texts))
        self.assertFalse(any("Con gusto te ayudo" in text for text in assistant_texts))
        self.assertFalse(any("Con quién tengo el gusto" in text for text in assistant_texts[1:]))

    def test_two_turn_onboarding_resumes_financing_question_over_generic_pending(self) -> None:
        state = initial_state()
        state["customer_info"] = {}
        state["onboarding_greeting_done"] = False
        state["awaiting_customer_name"] = True
        state["pending_onboarding_user_message"] = "¡Hola! Quiero más información"
        state["owner_user_id"] = "owner-uuid"
        state["messages"] = [
            {"role": "user", "content": "¡Hola! Quiero más información", "type": "HumanMessage"},
            {
                "role": "assistant",
                "content": "Hola, buen día. ¿En qué te puedo ayudar? ¿Con quién tengo el gusto?",
                "type": "AIMessage",
            },
            {
                "role": "user",
                "content": (
                    "Con julio cuál es el enganche para un Susuki como el del anuncio "
                    "y como quedarían los pagos"
                ),
                "type": "HumanMessage",
            },
        ]
        state["last_bot_message"] = "Hola, buen día. ¿En qué te puedo ayudar? ¿Con quién tengo el gusto?"
        sample_plan = {
            "id": "plan-1",
            "name": "Plan Suzuki",
            "lender": "Banco",
            "active": True,
            "vehicles": [{"id": "v1", "brand": "Suzuki", "model": "Swift", "status": "available"}],
        }

        with (
            patch(
                "src.nodes.customer_onboarding.extract_customer_name",
                return_value={
                    "nombre": "Julio",
                    "is_refusal": False,
                    "mensaje_restante": (
                        "cuál es el enganche para un Susuki como el del anuncio "
                        "y como quedarían los pagos"
                    ),
                },
            ),
            patch(
                "src.nodes.customer_onboarding.classify_onboarding_first_message",
                return_value=_onboarding_commercial_flags(),
            ),
            patch("src.nodes.customer_onboarding.sync_customer_info_to_backend"),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="FINANCING"),
            patch("src.nodes.financing.fetch_financing_plans", return_value=[sample_plan]),
            patch("src.nodes.financing.classify_financing_step_flags", return_value={}),
            patch("src.nodes.router.generate_other_response") as other_mock,
            patch("src.utils.financing_advisor_notify.push_event_to_backend"),
            patch("src.utils.financing_advisor_notify.notify_advisor", return_value=True),
            patch(
                "src.utils.financing_advisor_notify.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
            patch(
                "src.utils.financing_advisor_notify.classify_financing_detail_escalation",
                return_value=True,
            ),
        ):
            updated = self.graph.invoke(state)

        other_mock.assert_not_called()
        self.assertEqual(updated.get("customer_info", {}).get("nombre"), "Julio")
        self.assertTrue(updated.get("financing_detail_push_sent"))
        self.assertTrue(updated.get("bot_disabled"))
        assistant_texts = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertTrue(any("Mucho gusto, Julio" in text for text in assistant_texts))
        self.assertTrue(any("Planes" in text or "plan" in text.lower() for text in assistant_texts))
        self.assertTrue(any("asesor" in text.lower() for text in assistant_texts))
        greeting_count = sum(1 for text in assistant_texts if "Con quién tengo el gusto" in text)
        self.assertEqual(greeting_count, 1)

    def test_commercial_query_instead_of_name_does_not_register_name(self) -> None:
        state = initial_state()
        state["customer_info"] = {}
        state["onboarding_greeting_done"] = False
        state["awaiting_customer_name"] = True
        state["messages"] = [
            {"role": "user", "content": "Hola! Quiero más información", "type": "HumanMessage"},
            {
                "role": "assistant",
                "content": "Hola, buen día. ¿En qué te puedo ayudar? ¿Con quién tengo el gusto?",
                "type": "AIMessage",
            },
            {"role": "user", "content": "Precio del dzire", "type": "HumanMessage"},
        ]
        state["last_bot_message"] = "Hola, buen día. ¿En qué te puedo ayudar? ¿Con quién tengo el gusto?"

        with (
            patch(
                "src.nodes.customer_onboarding.extract_customer_name",
                return_value={
                    "nombre": "Precio Del Dzire",
                    "is_refusal": False,
                    "mensaje_restante": None,
                },
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

        self.assertNotIn("nombre", updated.get("customer_info", {}))
        self.assertFalse(updated.get("awaiting_customer_name"))
        self.assertTrue(updated.get("onboarding_greeting_done"))
        assistant_texts = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertFalse(any("Mucho gusto, Precio Del Dzire" in text for text in assistant_texts))
        self.assertTrue(any("Con gusto te ayudo" in text for text in assistant_texts))

    def test_cotizar_vehicle_instead_of_name_resumes_vehicle_not_generic_pending(self) -> None:
        state = initial_state()
        state["customer_info"] = {}
        state["onboarding_greeting_done"] = False
        state["awaiting_customer_name"] = True
        state["pending_onboarding_user_message"] = "Hola! Quiero más información"
        state["messages"] = [
            {"role": "user", "content": "Hola! Quiero más información", "type": "HumanMessage"},
            {
                "role": "assistant",
                "content": "Hola, buen día. ¿En qué te puedo ayudar? ¿Con quién tengo el gusto?",
                "type": "AIMessage",
            },
            {"role": "user", "content": "Quiero cotizar el Swift", "type": "HumanMessage"},
        ]
        state["last_bot_message"] = "Hola, buen día. ¿En qué te puedo ayudar? ¿Con quién tengo el gusto?"

        with (
            patch(
                "src.nodes.customer_onboarding.extract_customer_name",
                return_value={
                    "nombre": "Quiero Cotizar El Swift",
                    "is_refusal": False,
                    "mensaje_restante": None,
                },
            ),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.intent_checker.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.router.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[]),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw.get("fallback", ""),
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertNotIn("nombre", updated.get("customer_info", {}))
        self.assertFalse(updated.get("awaiting_customer_name"))
        self.assertTrue(updated.get("onboarding_greeting_done"))
        assistant_texts = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertFalse(any("Mucho gusto, Quiero Cotizar El Swift" in text for text in assistant_texts))
        self.assertTrue(any("Con gusto te ayudo" in text for text in assistant_texts))
        # Prioriza la consulta comercial del segundo turno sobre el pendiente generico.
        self.assertEqual(updated.get("onboarding_resume_user_message"), "Quiero cotizar el Swift")
        self.assertEqual(updated.get("pending_onboarding_user_message"), "")
        self.assertEqual(updated.get("intent"), "vehicle_catalog")
        self.assertFalse(updated.get("bot_disabled"))
        self.assertFalse(updated.get("financing_detail_push_sent"))

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

    def test_known_name_vague_commercial_welcome_does_not_duplicate_greeting(self) -> None:
        state = with_user_message(initial_state(), "¡Hola! Quiero más información")
        state["customer_info"] = {"nombre": "Julio"}
        state["onboarding_greeting_done"] = False

        with (
            patch(
                "src.nodes.customer_onboarding.generate_welcome_with_known_name",
                return_value="¡Hola Julio! Hola buen día, en qué te puedo ayudar.",
            ),
            patch(
                "src.nodes.customer_onboarding.classify_onboarding_first_message",
                return_value=_onboarding_commercial_flags(),
            ),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="OTHER"),
            patch("src.nodes.router.generate_other_response") as other_mock,
        ):
            updated = self.graph.invoke(state)

        other_mock.assert_not_called()
        self.assertTrue(updated.get("onboarding_greeting_done"))
        self.assertFalse(updated.get("onboarding_welcome_sent_this_turn"))
        assistant_messages = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertEqual(len(assistant_messages), 1)
        self.assertIn("Julio", assistant_messages[0])
        self.assertFalse(any("Con quién tengo el gusto" in text for text in assistant_messages))

    def test_known_name_commercial_intent_routes_after_welcome(self) -> None:
        state = with_user_message(initial_state(), "hola quiero ver el suzuki jimny")
        state["customer_info"] = {"nombre": "Julio"}
        state["onboarding_greeting_done"] = False

        with (
            patch(
                "src.nodes.customer_onboarding.generate_welcome_with_known_name",
                return_value="¡Hola Julio! ¿En qué te puedo ayudar?",
            ),
            patch(
                "src.nodes.customer_onboarding.classify_onboarding_first_message",
                return_value=_onboarding_commercial_flags(),
            ),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[]),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw.get("fallback", ""),
            ),
            patch("src.nodes.router.generate_other_response") as other_mock,
        ):
            updated = self.graph.invoke(state)

        other_mock.assert_not_called()
        self.assertEqual(updated.get("customer_info", {}).get("nombre"), "Julio")
        self.assertEqual(updated.get("current_node"), "car_selection")
        assistant_messages = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertTrue(any("Julio" in text for text in assistant_messages))

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

    def test_faq_during_name_capture_resumes_pending_then_answers_faq(self) -> None:
        state = initial_state()
        state["customer_info"] = {}
        state["onboarding_greeting_done"] = False
        state["awaiting_customer_name"] = True
        state["pending_onboarding_user_message"] = "¡Hola! Quiero más información"
        state["selected_vehicle_id"] = "veh-dzire"
        state["selected_car"] = "Suzuki Dzire 2026"
        state["show_selected_vehicle_detail_once"] = True
        state["messages"] = [
            {"role": "user", "content": "¡Hola! Quiero más información", "type": "HumanMessage"},
            {
                "role": "assistant",
                "content": "Hola, buen día. ¿En qué te puedo ayudar? ¿Con quién tengo el gusto?",
                "type": "AIMessage",
            },
            {
                "role": "user",
                "content": "Donde hacen los servicios de mantenimiento?",
                "type": "HumanMessage",
            },
        ]
        state["last_bot_message"] = "Hola, buen día. ¿En qué te puedo ayudar? ¿Con quién tengo el gusto?"

        vehicle = {
            "id": "veh-dzire",
            "brand": "Suzuki",
            "model": "Dzire",
            "year": 2026,
            "price": 312990,
            "status": "available",
            "images": [],
        }

        with (
            patch(
                "src.nodes.customer_onboarding.extract_customer_name",
                return_value={"nombre": None, "is_refusal": True, "mensaje_restante": None},
            ),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.intent_checker.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.router.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[vehicle]),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=vehicle),
            patch(
                "src.nodes.car_selection.generate_vehicle_detail_conversation",
                return_value="Te presento el Suzuki Dzire Boostergreen 2026.",
            ),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw.get("fallback", ""),
            ),
            patch(
                "src.nodes.car_selection._build_technical_sheet_message",
                return_value="Aquí tienes la ficha técnica",
            ),
            patch(
                "src.nodes.faq.fetch_faq_candidates",
                return_value=["El taller está en Av. Servicio 100."],
            ),
            patch(
                "src.nodes.faq.generate_faq_user_turn",
                return_value="El taller de mantenimiento está en Av. Servicio 100.",
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertFalse(updated.get("awaiting_customer_name"))
        self.assertTrue(updated.get("onboarding_greeting_done"))
        self.assertEqual(updated.get("deferred_faq_user_message"), "")
        self.assertEqual(updated.get("pending_onboarding_user_message"), "")
        assistant_texts = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertTrue(any("Con gusto te ayudo" in text for text in assistant_texts))
        self.assertTrue(any("Suzuki Dzire" in text for text in assistant_texts))
        self.assertTrue(any("taller de mantenimiento" in text.lower() for text in assistant_texts))
        # Comercial primero, FAQ después.
        dzire_idx = next(i for i, text in enumerate(assistant_texts) if "Suzuki Dzire" in text)
        faq_idx = next(i for i, text in enumerate(assistant_texts) if "taller de mantenimiento" in text.lower())
        self.assertLess(dzire_idx, faq_idx)

    def test_first_message_faq_asks_name_then_answers_faq_same_turn(self) -> None:
        state = with_user_message(
            initial_state(),
            "Donde hacen los servicios de mantenimiento?",
        )
        state["customer_info"] = {}
        state["onboarding_greeting_done"] = False

        with (
            patch(
                "src.nodes.customer_onboarding.generate_welcome_and_name_request",
                return_value="Hola, buen día. ¿Con quién tengo el gusto?",
            ),
            patch(
                "src.nodes.customer_onboarding.classify_onboarding_first_message",
                return_value=_onboarding_greeting_flags(),
            ),
            patch(
                "src.nodes.faq.fetch_faq_candidates",
                return_value=["El taller está en Av. Servicio 100."],
            ),
            patch(
                "src.nodes.faq.generate_faq_user_turn",
                return_value="El taller de mantenimiento está en Av. Servicio 100.",
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertTrue(updated.get("awaiting_customer_name"))
        self.assertEqual(updated.get("deferred_faq_user_message"), "")
        self.assertEqual(updated.get("pending_onboarding_user_message"), "")
        assistant_texts = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertTrue(any("Con quién tengo el gusto" in text for text in assistant_texts))
        self.assertTrue(any("taller de mantenimiento" in text.lower() for text in assistant_texts))
        welcome_idx = next(i for i, text in enumerate(assistant_texts) if "Con quién tengo el gusto" in text)
        faq_idx = next(i for i, text in enumerate(assistant_texts) if "taller de mantenimiento" in text.lower())
        self.assertLess(welcome_idx, faq_idx)

    def test_faq_only_during_name_capture_answers_faq_same_turn(self) -> None:
        state = initial_state()
        state["customer_info"] = {}
        state["onboarding_greeting_done"] = False
        state["awaiting_customer_name"] = True
        state["pending_onboarding_user_message"] = ""
        state["messages"] = [
            {"role": "user", "content": "hola", "type": "HumanMessage"},
            {
                "role": "assistant",
                "content": "Hola, buen día. ¿Con quién tengo el gusto?",
                "type": "AIMessage",
            },
            {
                "role": "user",
                "content": "Donde hacen los servicios de mantenimiento?",
                "type": "HumanMessage",
            },
        ]
        state["last_bot_message"] = "Hola, buen día. ¿Con quién tengo el gusto?"

        with (
            patch(
                "src.nodes.customer_onboarding.extract_customer_name",
                return_value={"nombre": None, "is_refusal": True, "mensaje_restante": None},
            ),
            patch(
                "src.nodes.faq.fetch_faq_candidates",
                return_value=["El taller está en Av. Servicio 100."],
            ),
            patch(
                "src.nodes.faq.generate_faq_user_turn",
                return_value="El taller de mantenimiento está en Av. Servicio 100.",
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertFalse(updated.get("awaiting_customer_name"))
        self.assertEqual(updated.get("deferred_faq_user_message"), "")
        assistant_texts = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertTrue(any("taller de mantenimiento" in text.lower() for text in assistant_texts))
        self.assertFalse(any("Con quién tengo el gusto" in text for text in assistant_texts[1:]))

    def test_name_plus_faq_remainder_defers_faq_after_pending_commercial(self) -> None:
        state = initial_state()
        state["customer_info"] = {}
        state["onboarding_greeting_done"] = False
        state["awaiting_customer_name"] = True
        state["pending_onboarding_user_message"] = "¡Hola! Quiero más información"
        state["messages"] = [
            {"role": "user", "content": "¡Hola! Quiero más información", "type": "HumanMessage"},
            {
                "role": "assistant",
                "content": "Hola, buen día. ¿Con quién tengo el gusto?",
                "type": "AIMessage",
            },
            {
                "role": "user",
                "content": "Soy Julio, donde hacen los servicios de mantenimiento?",
                "type": "HumanMessage",
            },
        ]
        state["last_bot_message"] = "Hola, buen día. ¿Con quién tengo el gusto?"

        with (
            patch(
                "src.nodes.customer_onboarding.extract_customer_name",
                return_value={
                    "nombre": "Julio",
                    "is_refusal": False,
                    "mensaje_restante": "donde hacen los servicios de mantenimiento?",
                },
            ),
            patch("src.nodes.customer_onboarding.sync_customer_info_to_backend"),
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.intent_checker.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG"),
            patch("src.nodes.router.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[]),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw.get("fallback", ""),
            ),
            patch(
                "src.nodes.faq.fetch_faq_candidates",
                return_value=["El taller está en Av. Servicio 100."],
            ),
            patch(
                "src.nodes.faq.generate_faq_user_turn",
                return_value="El taller de mantenimiento está en Av. Servicio 100.",
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("customer_info", {}).get("nombre"), "Julio")
        self.assertFalse(updated.get("awaiting_customer_name"))
        self.assertEqual(updated.get("deferred_faq_user_message"), "")
        assistant_texts = [m["content"] for m in updated["messages"] if m.get("role") == "assistant"]
        self.assertTrue(any("Mucho gusto, Julio" in text for text in assistant_texts))
        self.assertTrue(any("taller de mantenimiento" in text.lower() for text in assistant_texts))

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
