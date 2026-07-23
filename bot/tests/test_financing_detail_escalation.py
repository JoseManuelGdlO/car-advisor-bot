"""Escalacion por dudas detalladas de financiamiento."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from src.nodes.faq import faq
from src.nodes.financing import financing
from src.nodes.intent_checker import intent_checker
from src.nodes.router import router
from src.utils.financing_advisor_notify import (
    append_down_payment_faq_if_applicable,
    handle_financing_detail_escalation,
    is_custom_term_financing_request,
    is_financing_catalog_request,
    is_financing_personalized_quote_request,
    is_vehicle_quote_without_financing_context,
    maybe_escalate_financing_detail,
    resolve_client_display_phone,
)
from src.utils.financing_credit_faq import (
    CREDIT_FAQ_ADVISOR_CLOSE,
    is_credit_requirements_faq_question,
    is_short_affirmative_reply,
    suspend_financing_commercial_state,
)
from tests.test_helpers import initial_state, with_user_message


def _state_with_bot_exchange(*, user: str, bot: str, node: str = "financing") -> dict:
    state = with_user_message(initial_state(), user)
    state["messages"].insert(-1, {"role": "assistant", "content": bot, "type": "AIMessage"})
    state["current_node"] = node
    state["last_bot_message"] = bot
    state["user_id"] = "5215512345678@s.whatsapp.net"
    state["owner_user_id"] = "owner-uuid"
    state["conversation_id"] = "conv-uuid"
    return state


class TestResolveClientDisplayPhone(unittest.TestCase):
    def test_prefers_display_phone_from_crm(self) -> None:
        state = initial_state()
        state["display_phone"] = "6181556489"
        state["customer_info"] = {"telefono": "60911863783463@lid"}
        self.assertEqual(resolve_client_display_phone(state), "6181556489")

    def test_falls_back_to_customer_telefono(self) -> None:
        state = initial_state()
        state["customer_info"] = {"telefono": "5512345678"}
        self.assertEqual(resolve_client_display_phone(state), "5512345678")


class TestHandleFinancingDetailEscalation(unittest.TestCase):
    def test_idempotent_second_call_skips_push(self) -> None:
        state = _state_with_bot_exchange(user="Me aprueban con mal buro?", bot="Estos son los planes")
        state["financing_detail_push_sent"] = True
        before_n = len(state.get("messages", []))
        out = handle_financing_detail_escalation(dict(state))
        self.assertEqual(len(out.get("messages", [])), before_n)

    def test_push_body_uses_display_phone(self) -> None:
        state = _state_with_bot_exchange(user="Me aprueban con mal buro?", bot="Planes disponibles")
        state["display_phone"] = "6181556489"

        mock_post = MagicMock()
        mock_post.return_value.raise_for_status = MagicMock()

        with (
            patch("src.utils.financing_advisor_notify.push_event_to_backend") as ev,
            patch("src.tools.vehicles.requests.post", mock_post),
            patch(
                "src.utils.financing_advisor_notify.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
        ):
            out = handle_financing_detail_escalation(dict(state))

        self.assertTrue(out.get("financing_detail_push_sent"))
        self.assertTrue(out.get("bot_disabled"))
        ev.assert_called_once()
        self.assertEqual(ev.call_args[0][0].get("message"), "Cliente necesita ayuda con financiamiento")
        self.assertEqual(ev.call_args[0][0].get("from"), "system")
        payload = mock_post.call_args[1]["json"]
        self.assertEqual(payload.get("body"), "6181556489 necesita ayuda para resolver dudas")
        self.assertEqual(payload.get("title"), "Cliente necesita ayuda")
        self.assertEqual(payload.get("data", {}).get("notification_kind"), "financing_detail_help")
        self.assertEqual(payload.get("data", {}).get("conversationId"), "conv-uuid")

    def test_appends_down_payment_message_before_advisor_ack_when_configured(self) -> None:
        state = _state_with_bot_exchange(
            user="Cuánto sería de enganche y mensualidad",
            bot="Para el financiamiento, tenemos la oferta comercial Suzuki.",
        )
        with (
            patch("src.utils.financing_advisor_notify.push_event_to_backend"),
            patch("src.utils.financing_advisor_notify.notify_advisor", return_value=True),
            patch(
                "src.utils.financing_advisor_notify.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
            patch(
                "src.utils.financing_advisor_notify.get_bot_settings",
                return_value={"downPaymentMessage": "El enganche minimo para un carro es de 15%"},
            ),
        ):
            out = handle_financing_detail_escalation(
                dict(state),
                user_message="Cuánto sería de enganche y mensualidad",
            )
        msgs = [m.get("content", "") for m in out.get("messages", []) if m.get("role") == "assistant"]
        tail = msgs[-2:]
        self.assertEqual(len(tail), 2)
        self.assertEqual(tail[0], "El enganche minimo para un carro es de 15%")
        self.assertIn("Un asesor te contactara", tail[1])

    def test_skips_down_payment_message_when_not_configured(self) -> None:
        state = _state_with_bot_exchange(
            user="Cuánto sería de enganche y mensualidad",
            bot="Para el financiamiento, tenemos la oferta comercial Suzuki.",
        )
        with (
            patch("src.utils.financing_advisor_notify.push_event_to_backend"),
            patch("src.utils.financing_advisor_notify.notify_advisor", return_value=True),
            patch(
                "src.utils.financing_advisor_notify.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
            patch(
                "src.utils.financing_advisor_notify.get_bot_settings",
                return_value={"downPaymentMessage": None},
            ),
        ):
            out = handle_financing_detail_escalation(
                dict(state),
                user_message="Cuánto sería de enganche y mensualidad",
            )
        msgs = [m.get("content", "") for m in out.get("messages", []) if m.get("role") == "assistant"]
        tail = msgs[-1:]
        self.assertEqual(len(tail), 1)
        self.assertIn("Un asesor te contactara", tail[0])

    def test_skips_down_payment_message_without_enganche_in_user_text(self) -> None:
        state = _state_with_bot_exchange(user="Me aprueban con mal buro?", bot="Estos son los planes")
        with (
            patch("src.utils.financing_advisor_notify.push_event_to_backend"),
            patch("src.utils.financing_advisor_notify.notify_advisor", return_value=True),
            patch(
                "src.utils.financing_advisor_notify.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
            patch(
                "src.utils.financing_advisor_notify.get_bot_settings",
                return_value={"downPaymentMessage": "El enganche minimo para un carro es de 15%"},
            ),
        ):
            out = handle_financing_detail_escalation(
                dict(state),
                user_message="Me aprueban con mal buro?",
            )
        msgs = [m.get("content", "") for m in out.get("messages", []) if m.get("role") == "assistant"]
        tail = msgs[-1:]
        self.assertEqual(len(tail), 1)
        self.assertIn("Un asesor te contactara", tail[0])
        self.assertNotIn("15%", tail[0])


class TestVisitIncentiveOnFinancingEscalation(unittest.TestCase):
    def test_appends_visit_incentive_before_advisor_ack_when_configured(self) -> None:
        state = _state_with_bot_exchange(
            user="Me aprueban con mal buro?",
            bot="Estos son los planes",
        )
        with (
            patch("src.utils.financing_advisor_notify.push_event_to_backend"),
            patch("src.utils.financing_advisor_notify.notify_advisor", return_value=True),
            patch(
                "src.utils.financing_advisor_notify.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
            patch(
                "src.utils.financing_advisor_notify.get_bot_settings",
                return_value={
                    "visitIncentiveMessage": "Te invitamos a visitarnos en la agencia",
                },
            ),
        ):
            out = handle_financing_detail_escalation(
                dict(state),
                user_message="Me aprueban con mal buro?",
            )
        msgs = [m.get("content", "") for m in out.get("messages", []) if m.get("role") == "assistant"]
        tail = msgs[-2:]
        self.assertEqual(len(tail), 2)
        self.assertEqual(tail[0], "Te invitamos a visitarnos en la agencia")
        self.assertIn("Un asesor te contactara", tail[1])

    def test_skips_visit_incentive_when_not_configured(self) -> None:
        state = _state_with_bot_exchange(
            user="Me aprueban con mal buro?",
            bot="Estos son los planes",
        )
        with (
            patch("src.utils.financing_advisor_notify.push_event_to_backend"),
            patch("src.utils.financing_advisor_notify.notify_advisor", return_value=True),
            patch(
                "src.utils.financing_advisor_notify.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
            patch(
                "src.utils.financing_advisor_notify.get_bot_settings",
                return_value={"visitIncentiveMessage": None},
            ),
        ):
            out = handle_financing_detail_escalation(
                dict(state),
                user_message="Me aprueban con mal buro?",
            )
        msgs = [m.get("content", "") for m in out.get("messages", []) if m.get("role") == "assistant"]
        tail = msgs[-1:]
        self.assertEqual(len(tail), 1)
        self.assertIn("Un asesor te contactara", tail[0])

    def test_appends_down_payment_then_visit_incentive_then_ack(self) -> None:
        state = _state_with_bot_exchange(
            user="Cuánto sería de enganche y mensualidad",
            bot="Para el financiamiento, tenemos la oferta comercial Suzuki.",
        )
        with (
            patch("src.utils.financing_advisor_notify.push_event_to_backend"),
            patch("src.utils.financing_advisor_notify.notify_advisor", return_value=True),
            patch(
                "src.utils.financing_advisor_notify.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
            patch(
                "src.utils.financing_advisor_notify.get_bot_settings",
                return_value={
                    "downPaymentMessage": "El enganche minimo para un carro es de 15%",
                    "visitIncentiveMessage": "Te invitamos a visitarnos en la agencia",
                },
            ),
        ):
            out = handle_financing_detail_escalation(
                dict(state),
                user_message="Cuánto sería de enganche y mensualidad",
            )
        msgs = [m.get("content", "") for m in out.get("messages", []) if m.get("role") == "assistant"]
        tail = msgs[-3:]
        self.assertEqual(len(tail), 3)
        self.assertEqual(tail[0], "El enganche minimo para un carro es de 15%")
        self.assertEqual(tail[1], "Te invitamos a visitarnos en la agencia")
        self.assertIn("Un asesor te contactara", tail[2])


class TestDownPaymentFaqAppend(unittest.TestCase):
    def test_appends_configured_message_for_any_enganche_question(self) -> None:
        state = _state_with_bot_exchange(
            user="De cuanto es el enganche para un carro?",
            bot="Estos son los planes disponibles.",
        )
        with patch(
            "src.utils.financing_advisor_notify.get_bot_settings",
            return_value={"downPaymentMessage": "El enganche minimo para un carro es de 15%"},
        ):
            out = append_down_payment_faq_if_applicable(
                dict(state),
                "De cuanto es el enganche para un carro?",
            )
        msgs = [m.get("content", "") for m in out.get("messages", []) if m.get("role") == "assistant"]
        self.assertEqual(msgs[-1], "El enganche minimo para un carro es de 15%")

    def test_does_not_duplicate_if_already_last_assistant(self) -> None:
        state = _state_with_bot_exchange(
            user="cuanto de enganche",
            bot="El enganche minimo para un carro es de 15%",
        )
        with patch(
            "src.utils.financing_advisor_notify.get_bot_settings",
            return_value={"downPaymentMessage": "El enganche minimo para un carro es de 15%"},
        ):
            out = append_down_payment_faq_if_applicable(dict(state), "cuanto de enganche")
        msgs = [m.get("content", "") for m in out.get("messages", []) if m.get("role") == "assistant"]
        self.assertEqual(msgs.count("El enganche minimo para un carro es de 15%"), 1)


class TestIsFinancingCatalogRequest(unittest.TestCase):
    def test_detects_plan_catalog_browse_with_typo(self) -> None:
        self.assertTrue(is_financing_catalog_request("planes de financieamiento"))

    def test_detects_standard_catalog_phrases(self) -> None:
        self.assertTrue(is_financing_catalog_request("que planes de financiamiento tienen"))
        self.assertTrue(is_financing_catalog_request("cuales son las tasas"))
        self.assertTrue(
            is_financing_catalog_request(
                "cual es el enganche para un suzuki como el del anuncio y como quedarian los pagos"
            )
        )

    def test_rejects_personalized_credit_questions(self) -> None:
        self.assertFalse(is_financing_catalog_request("me aprueban con mal buro"))
        self.assertFalse(is_financing_catalog_request("puedo financiar con comprobante informal"))

    def test_rejects_personalized_quote_requests(self) -> None:
        self.assertFalse(is_financing_catalog_request("cuanto seria de enganche y mensualidad"))
        self.assertTrue(is_financing_personalized_quote_request("Cuánto sería de enganche y mensualidad"))

    def test_rejects_custom_term_requests(self) -> None:
        self.assertTrue(is_custom_term_financing_request("Quiero un plan de financiamiento a 24 meses"))
        self.assertFalse(is_financing_catalog_request("Quiero un plan de financiamiento a 24 meses"))
        self.assertFalse(is_custom_term_financing_request("hay plan de financiamiento?"))

    def test_detects_promo_plus_catalog_compound(self) -> None:
        self.assertTrue(
            is_financing_catalog_request("aplico la promocion, hay plan de financiamiento?")
        )

    def test_vehicle_cotizar_without_financing_is_not_personalized_quote(self) -> None:
        self.assertTrue(is_vehicle_quote_without_financing_context("Quiero cotizar el Swift"))
        self.assertTrue(is_vehicle_quote_without_financing_context("cotizacion del Jimny"))
        self.assertFalse(is_financing_personalized_quote_request("Quiero cotizar el Swift"))
        self.assertFalse(is_vehicle_quote_without_financing_context("cotizar enganche y mensualidad"))
        self.assertTrue(is_financing_personalized_quote_request("cotizar enganche y mensualidad"))


class TestMaybeEscalateFinancingDetail(unittest.TestCase):
    def test_returns_none_when_classifier_false(self) -> None:
        state = _state_with_bot_exchange(user="Que planes tienen?", bot="Lista de planes")
        with patch(
            "src.utils.financing_advisor_notify.classify_financing_detail_escalation",
            return_value=False,
        ):
            self.assertIsNone(maybe_escalate_financing_detail(state, trigger="test"))

    def test_escalates_when_classifier_true(self) -> None:
        state = _state_with_bot_exchange(user="Me aprueban con mal buro?", bot="Planes")
        with (
            patch(
                "src.utils.financing_advisor_notify.classify_financing_detail_escalation",
                return_value=True,
            ),
            patch("src.utils.financing_advisor_notify.push_event_to_backend"),
            patch("src.utils.financing_advisor_notify.notify_advisor", return_value=True),
            patch(
                "src.utils.financing_advisor_notify.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
        ):
            out = maybe_escalate_financing_detail(state, trigger="test")
        self.assertIsNotNone(out)
        assert out is not None
        self.assertTrue(out.get("financing_detail_push_sent"))


    def test_skips_catalog_request_when_llm_false(self) -> None:
        state = _state_with_bot_exchange(user="planes de financieamiento", bot="Hola Javier")
        with patch(
            "src.utils.financing_advisor_notify.classify_financing_detail_escalation",
            return_value=False,
        ) as classify_mock:
            self.assertIsNone(maybe_escalate_financing_detail(state, trigger="test"))
        classify_mock.assert_called_once()

    def test_overrides_llm_true_for_clear_catalog_request(self) -> None:
        state = _state_with_bot_exchange(
            user="aplico la promocion, hay plan de financiamiento?",
            bot="Promociones aplicables al Jetta...",
            node="promotions",
        )
        with patch(
            "src.utils.financing_advisor_notify.classify_financing_detail_escalation",
            return_value=True,
        ) as classify_mock:
            self.assertIsNone(maybe_escalate_financing_detail(state, trigger="test"))
        classify_mock.assert_called_once()

    def test_llm_can_escalate_catalog_looking_specific_term(self) -> None:
        state = _state_with_bot_exchange(
            user="Quiero un plan de financiamiento a 24 meses",
            bot="¿Te gustaría agendar una prueba de manejo?",
        )
        with (
            patch(
                "src.utils.financing_advisor_notify.classify_financing_detail_escalation",
                return_value=True,
            ) as classify_mock,
            patch("src.utils.financing_advisor_notify.push_event_to_backend"),
            patch("src.utils.financing_advisor_notify.notify_advisor", return_value=True),
            patch(
                "src.utils.financing_advisor_notify.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
        ):
            out = maybe_escalate_financing_detail(state, trigger="test")
        classify_mock.assert_called_once()
        self.assertIsNotNone(out)
        assert out is not None
        self.assertTrue(out.get("financing_detail_push_sent"))
        self.assertTrue(out.get("bot_disabled"))

    def test_skips_promotion_apply_when_classifier_false(self) -> None:
        state = _state_with_bot_exchange(
            user="quiero aplicar la promocion",
            bot="Promociones aplicables al Jetta...",
            node="promotions",
        )
        with patch(
            "src.utils.financing_advisor_notify.classify_financing_detail_escalation",
            return_value=False,
        ) as classify_mock:
            self.assertIsNone(maybe_escalate_financing_detail(state, trigger="test"))
        classify_mock.assert_called_once()

    def test_escalates_personalized_quote_via_heuristic_after_llm_false(self) -> None:
        state = _state_with_bot_exchange(
            user="Cuánto sería de enganche y mensualidad",
            bot="Para el financiamiento, tenemos la oferta comercial Suzuki.",
        )
        with (
            patch("src.utils.financing_advisor_notify.push_event_to_backend"),
            patch("src.utils.financing_advisor_notify.notify_advisor", return_value=True),
            patch(
                "src.utils.financing_advisor_notify.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
            patch(
                "src.utils.financing_advisor_notify.classify_financing_detail_escalation",
                return_value=False,
            ) as classify_mock,
        ):
            out = maybe_escalate_financing_detail(state, trigger="test")
        classify_mock.assert_called_once()
        self.assertIsNotNone(out)
        assert out is not None
        self.assertTrue(out.get("financing_detail_push_sent"))
        self.assertTrue(out.get("bot_disabled"))

    def test_skips_vehicle_cotizar_even_if_llm_would_escalate(self) -> None:
        state = _state_with_bot_exchange(
            user="Quiero cotizar el Swift",
            bot="Bienvenido. ¿En qué te puedo ayudar?",
            node="start",
        )
        with patch(
            "src.utils.financing_advisor_notify.classify_financing_detail_escalation",
            return_value=True,
        ) as classify_mock:
            self.assertIsNone(maybe_escalate_financing_detail(state, trigger="test"))
        classify_mock.assert_not_called()


class TestIntentCheckerFinancingEscalation(unittest.TestCase):
    def test_escalates_from_financing_node(self) -> None:
        state = _state_with_bot_exchange(
            user="Puedo financiar con comprobante informal?",
            bot="Estos son los planes",
            node="financing",
        )
        with (
            patch(
                "src.nodes.intent_checker.classify_faq_interrupt_flags",
                return_value={
                    "interrumpir_por_faq": False,
                    "quiere_asesor_humano": False,
                    "tema_financiamiento_credi": True,
                    "es_respuesta_o_seguimiento_al_ultimo_bot": False,
                },
            ),
            patch(
                "src.nodes.intent_checker.maybe_escalate_financing_detail",
            ) as escalate_mock,
            patch(
                "src.utils.financing_advisor_notify.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
        ):
            escalated_state = {**state, "financing_detail_push_sent": True, "bot_disabled": True}
            escalate_mock.return_value = escalated_state
            out = intent_checker(dict(state))
        self.assertTrue(out.get("financing_detail_push_sent"))
        escalate_mock.assert_called_once()

    def test_business_faq_interrupt_skips_escalation_when_faq_flag_set(self) -> None:
        state = _state_with_bot_exchange(
            user="revisan buro de credito",
            bot="Puedo ayudarte con planes",
            node="financing",
        )
        with (
            patch(
                "src.nodes.intent_checker.classify_faq_interrupt_flags",
                return_value={
                    "interrumpir_por_faq": True,
                    "quiere_asesor_humano": False,
                    "tema_financiamiento_credi": False,
                    "es_respuesta_o_seguimiento_al_ultimo_bot": False,
                },
            ),
            patch("src.nodes.intent_checker.maybe_escalate_financing_detail") as escalate_mock,
        ):
            out = intent_checker(dict(state))
        escalate_mock.assert_not_called()
        self.assertTrue(out.get("is_faq_interrupt"))

    def test_car_selection_buro_question_routes_to_faq(self) -> None:
        state = _state_with_bot_exchange(
            user="revisan buro de credito",
            bot="Aqui tienes los modelos disponibles.",
            node="car_selection",
        )
        with (
            patch(
                "src.nodes.intent_checker.classify_faq_interrupt_flags",
                return_value={
                    "interrumpir_por_faq": True,
                    "quiere_asesor_humano": False,
                    "tema_financiamiento_credi": False,
                    "es_respuesta_o_seguimiento_al_ultimo_bot": False,
                },
            ),
            patch(
                "src.nodes.intent_checker.maybe_escalate_financing_detail",
                return_value=None,
            ),
        ):
            out = intent_checker(dict(state))
        self.assertTrue(out.get("is_faq_interrupt"))
        self.assertEqual(out.get("current_node"), "faq")
        self.assertEqual(out.get("resume_to_step"), "car_selection")

    def test_start_node_does_not_escalate_affirmative_bureau_followup(self) -> None:
        """Fuera de nodos comerciales (p. ej. start tras onboarding) no se escala aqui."""

        state = _state_with_bot_exchange(
            user="Si por favor",
            bot="Te gustaria que te explique como funciona el proceso de revision del buro de credito?",
            node="start",
        )
        with (
            patch(
                "src.nodes.intent_checker.classify_faq_interrupt_flags",
                return_value={
                    "interrumpir_por_faq": False,
                    "quiere_asesor_humano": False,
                    "tema_financiamiento_credi": True,
                    "es_respuesta_o_seguimiento_al_ultimo_bot": True,
                },
            ),
            patch(
                "src.nodes.intent_checker.maybe_escalate_financing_detail",
            ) as escalate_mock,
        ):
            out = intent_checker(dict(state))
        escalate_mock.assert_not_called()
        self.assertFalse(out.get("financing_detail_push_sent"))
        self.assertFalse(out.get("bot_disabled"))
        self.assertEqual(out.get("current_node"), "start")


class TestFinancingCreditFaqLayer1(unittest.TestCase):
    def test_detects_credit_requirements_question(self) -> None:
        self.assertTrue(is_credit_requirements_faq_question("cuales son los requisitos de credito"))
        self.assertFalse(is_credit_requirements_faq_question("que planes de financiamiento tienen"))

    def test_short_affirmative_reply(self) -> None:
        self.assertTrue(is_short_affirmative_reply("si"))
        self.assertTrue(is_short_affirmative_reply("Si por favor"))
        self.assertFalse(is_short_affirmative_reply("quiero ver el plan 2"))

    def test_suspend_financing_clears_plan_selection_flags(self) -> None:
        state = initial_state()
        state["awaiting_financing_plan_selection"] = True
        state["awaiting_financing_vehicle_selection"] = True
        suspend_financing_commercial_state(state)
        self.assertFalse(state.get("awaiting_financing_plan_selection"))
        self.assertFalse(state.get("awaiting_financing_vehicle_selection"))
        self.assertEqual(state.get("last_faq_interrupt_topic"), "credit_requirements")
        snapshot = state.get("financing_interrupt_snapshot")
        assert isinstance(snapshot, dict)
        self.assertTrue(snapshot.get("awaiting_financing_plan_selection"))

    def test_faq_interrupt_credit_uses_advisor_close(self) -> None:
        state = with_user_message(initial_state(), "cuales son los requisitos de credito")
        state["is_faq_interrupt"] = True
        state["resume_to_step"] = "financing"
        state["last_faq_interrupt_topic"] = "credit_requirements"
        with (
            patch("src.nodes.faq.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["P: Requisitos?\nR: INE y estados de cuenta."]),
            patch("src.nodes.faq.generate_faq_user_turn") as turn_mock,
        ):
            turn_mock.return_value = "Requisitos generales."
            out = faq(dict(state))
        turn_mock.assert_called_once()
        self.assertEqual(turn_mock.call_args.kwargs.get("transition_literal"), CREDIT_FAQ_ADVISOR_CLOSE)
        self.assertTrue(out.get("financing_credit_followup_pending"))

    def test_affirmative_after_credit_faq_escalates_deterministically(self) -> None:
        bot_msg = (
            "Los requisitos son INE y estados de cuenta. "
            f"{CREDIT_FAQ_ADVISOR_CLOSE}"
        )
        state = _state_with_bot_exchange(user="si", bot=bot_msg, node="financing")
        state["financing_credit_followup_pending"] = True
        with (
            patch(
                "src.nodes.intent_checker.classify_faq_interrupt_flags",
                return_value={
                    "interrumpir_por_faq": False,
                    "quiere_asesor_humano": False,
                    "tema_financiamiento_credi": False,
                    "es_respuesta_o_seguimiento_al_ultimo_bot": True,
                },
            ),
            patch(
                "src.nodes.intent_checker.maybe_escalate_financing_detail",
                return_value=None,
            ),
            patch("src.nodes.intent_checker.handle_financing_detail_escalation") as escalate_mock,
        ):
            escalated = {**state, "financing_detail_push_sent": True, "bot_disabled": True}
            escalate_mock.return_value = escalated
            out = intent_checker(dict(state))
        escalate_mock.assert_called_once()
        self.assertTrue(out.get("financing_detail_push_sent"))
        self.assertFalse(out.get("financing_credit_followup_pending"))

    def test_credit_faq_interrupt_suspends_plan_selection(self) -> None:
        state = _state_with_bot_exchange(
            user="cuales son los requisitos de credito",
            bot="Si te interesa uno, dime el nombre o numero del plan.",
            node="financing",
        )
        state["awaiting_financing_plan_selection"] = True
        with patch(
            "src.nodes.intent_checker.classify_faq_interrupt_flags",
            return_value={
                "interrumpir_por_faq": True,
                "quiere_asesor_humano": False,
                "tema_financiamiento_credi": False,
                "es_respuesta_o_seguimiento_al_ultimo_bot": False,
            },
        ):
            out = intent_checker(dict(state))
        self.assertTrue(out.get("is_faq_interrupt"))
        self.assertFalse(out.get("awaiting_financing_plan_selection"))
        self.assertEqual(out.get("last_faq_interrupt_topic"), "credit_requirements")


class TestRouterFinancingEscalation(unittest.TestCase):
    def test_router_financing_intent_can_escalate(self) -> None:
        state = with_user_message(initial_state(), "Me aprueban si tengo mal historial?")
        state["onboarding_greeting_done"] = True
        state["owner_user_id"] = "owner-uuid"
        with (
            patch("src.nodes.router.classify_router_intent", return_value="FINANCING"),
            patch("src.nodes.router.maybe_escalate_financing_detail") as escalate_mock,
        ):
            escalated = {**state, "financing_detail_push_sent": True, "bot_disabled": True}
            escalate_mock.return_value = escalated
            out = router(dict(state))
        self.assertTrue(out.get("financing_detail_push_sent"))
        escalate_mock.assert_called_once()


class TestFinancingNodeEscalation(unittest.TestCase):
    def test_financing_node_does_not_escalate_catalog_request(self) -> None:
        state = _state_with_bot_exchange(user="planes de financieamiento", bot="Hola Javier")
        with patch(
            "src.utils.financing_advisor_notify.handle_financing_detail_escalation",
        ) as escalate_mock:
            with patch("src.nodes.financing.maybe_escalate_financing_detail", return_value=None):
                with patch("src.nodes.financing.fetch_financing_plans", return_value=[]):
                    with patch("src.nodes.financing.persist_commercial_selection_to_backend"):
                        out = financing(dict(state))
        escalate_mock.assert_not_called()
        self.assertFalse(out.get("financing_detail_push_sent"))
        self.assertFalse(out.get("bot_disabled"))

    def test_financing_node_escalates_at_entry_for_personalized_question(self) -> None:
        state = _state_with_bot_exchange(
            user="cual es el enganche para un suzuki y como quedarian los pagos",
            bot="Estos son los planes disponibles.",
        )
        state["owner_user_id"] = "owner-uuid"
        with patch(
            "src.nodes.financing.maybe_escalate_financing_detail",
        ) as escalate_mock:
            escalated = {**state, "financing_detail_push_sent": True, "bot_disabled": True}
            escalate_mock.return_value = escalated
            out = financing(dict(state))
        escalate_mock.assert_called_once()
        call_kwargs = escalate_mock.call_args.kwargs
        self.assertEqual(call_kwargs.get("trigger"), "financing_node_entry")
        self.assertTrue(out.get("financing_detail_push_sent"))

    def test_financing_node_appends_down_payment_faq_with_plans(self) -> None:
        state = _state_with_bot_exchange(
            user="De cuanto es el enganche y que planes tienen",
            bot="Hola",
        )
        sample_plan = {
            "id": "plan-1",
            "name": "Plan Suzuki",
            "lender": "Banco",
            "active": True,
            "rate": 1.0,
            "showRate": True,
            "maxTermMonths": 12,
            "vehicles": [{"id": "v1", "brand": "Suzuki", "model": "Swift", "status": "available"}],
        }
        with (
            patch("src.nodes.financing.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.financing.is_generic_down_payment_only_question", return_value=False),
            patch("src.nodes.financing.fetch_financing_plans", return_value=[sample_plan]),
            patch("src.nodes.financing.persist_commercial_selection_to_backend"),
            patch(
                "src.nodes.financing.append_down_payment_faq_if_applicable",
                side_effect=lambda s, text: {
                    **s,
                    "messages": list(s.get("messages", []))
                    + [
                        {
                            "role": "assistant",
                            "content": "El enganche minimo es 15%",
                            "type": "AIMessage",
                        }
                    ],
                },
            ) as faq_mock,
        ):
            out = financing(dict(state))
        faq_mock.assert_called_once()
        self.assertIn(
            "El enganche minimo es 15%",
            [m.get("content") for m in out.get("messages", [])],
        )
        self.assertIn("Plan Suzuki", str(out.get("messages", [])[-2].get("content", "")))

    def test_financing_node_generic_enganche_skips_plan_listing(self) -> None:
        state = _state_with_bot_exchange(
            user="Cuanto es el enganche minimo para hacer el carro",
            bot="Te muestro el Jimny.",
        )
        state["selected_vehicle_id"] = "65498f55-bd22-4738-b3fa-07d43d6fe956"
        state["selected_car"] = "Suzuki JIMNY 3-Puertas 2027 2027"
        global_plan = {
            "id": "plan-global",
            "name": "Plan Global",
            "lender": "Banco",
            "active": True,
            "vehicles": [{"id": "other", "brand": "Suzuki", "model": "Swift", "status": "available"}],
        }
        with (
            patch("src.nodes.financing.maybe_escalate_financing_detail", return_value=None),
            patch(
                "src.utils.financing_advisor_notify.get_bot_settings",
                return_value={"downPaymentMessage": "El enganche minimo para un carro es de 15%"},
            ),
            patch("src.nodes.financing.fetch_financing_plans_by_vehicle") as by_vehicle_mock,
            patch("src.nodes.financing.fetch_financing_plans", return_value=[global_plan]) as global_mock,
        ):
            out = financing(dict(state))
        by_vehicle_mock.assert_not_called()
        global_mock.assert_not_called()
        self.assertFalse(out.get("awaiting_financing_plan_selection"))
        contents = [m.get("content") for m in out.get("messages", [])]
        self.assertIn("El enganche minimo para un carro es de 15%", contents)
        self.assertTrue(all("Plan Global" not in str(c) for c in contents))

    def test_financing_node_vehicle_without_plans_does_not_fall_through(self) -> None:
        state = _state_with_bot_exchange(
            user="Que planes de financiamiento tiene este carro?",
            bot="Te muestro el Jimny.",
        )
        state["selected_vehicle_id"] = "65498f55-bd22-4738-b3fa-07d43d6fe956"
        state["selected_car"] = "Suzuki JIMNY 3-Puertas 2027 2027"
        global_plan = {
            "id": "plan-global",
            "name": "Plan Global",
            "lender": "Banco",
            "active": True,
            "vehicles": [{"id": "other", "brand": "Suzuki", "model": "Swift", "status": "available"}],
        }
        with (
            patch("src.nodes.financing.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.financing.fetch_financing_plans_by_vehicle", return_value=[]),
            patch("src.nodes.financing.fetch_financing_plans", return_value=[global_plan]) as global_mock,
            patch("src.nodes.financing.persist_commercial_selection_to_backend"),
        ):
            out = financing(dict(state))
        global_mock.assert_not_called()
        self.assertFalse(out.get("awaiting_financing_plan_selection"))
        last = str(out.get("messages", [])[-1].get("content", ""))
        self.assertIn("No encontre planes de financiamiento activos", last)
        self.assertNotIn("Plan Global", last)


class TestFaqNodeFinancingEscalation(unittest.TestCase):
    def test_faq_escalates_non_business_financing_question(self) -> None:
        state = with_user_message(initial_state(), "Me aprueban con mal buro?")
        state["current_node"] = "faq"
        with (
            patch("src.nodes.faq.maybe_escalate_financing_detail") as escalate_mock,
            patch("src.nodes.faq.fetch_faq_candidates", return_value=[]),
        ):
            escalated = {**state, "financing_detail_push_sent": True}
            escalate_mock.return_value = escalated
            out = faq(dict(state))
        escalate_mock.assert_called_once()
        self.assertTrue(out.get("financing_detail_push_sent"))

    def test_faq_evaluates_escalation_for_simple_business_question(self) -> None:
        state = with_user_message(initial_state(), "revisan buro de credito")
        state["current_node"] = "faq"
        with (
            patch(
                "src.nodes.faq.maybe_escalate_financing_detail",
                return_value=None,
            ) as escalate_mock,
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["P: Buró?\nR: Sí revisamos."]),
            patch("src.nodes.faq.generate_faq_user_turn", return_value="Sí revisamos buró."),
        ):
            faq(dict(state))
        escalate_mock.assert_called_once()

    def test_faq_escalates_detailed_bureau_question(self) -> None:
        state = with_user_message(
            initial_state(),
            "me puedes dar mas informacion sobre que detalles revisan del buro de credito",
        )
        state["current_node"] = "faq"
        with (
            patch("src.nodes.faq.maybe_escalate_financing_detail") as escalate_mock,
            patch("src.nodes.faq.fetch_faq_candidates", return_value=[]),
        ):
            escalated = {**state, "financing_detail_push_sent": True, "bot_disabled": True}
            escalate_mock.return_value = escalated
            out = faq(dict(state))
        escalate_mock.assert_called_once()
        self.assertTrue(out.get("financing_detail_push_sent"))

    def test_faq_node_returns_down_payment_message_for_enganche(self) -> None:
        state = with_user_message(initial_state(), "de cuanto es el enganche?")
        state["current_node"] = "faq"
        with (
            patch("src.nodes.faq.maybe_escalate_financing_detail", return_value=None),
            patch(
                "src.utils.financing_advisor_notify.get_bot_settings",
                return_value={"downPaymentMessage": "El enganche minimo es del 15%"},
            ),
            patch("src.nodes.faq.fetch_faq_candidates") as fetch_mock,
        ):
            out = faq(dict(state))
        fetch_mock.assert_not_called()
        msgs = [m.get("content", "") for m in out.get("messages", []) if m.get("role") == "assistant"]
        self.assertEqual(msgs[-1], "El enganche minimo es del 15%")
        self.assertEqual(out.get("current_node"), "router")

    def test_faq_node_does_not_duplicate_down_payment_message(self) -> None:
        msg = "El enganche minimo es del 15%"
        state = _state_with_bot_exchange(user="de cuanto es el enganche?", bot=msg)
        state["current_node"] = "faq"
        with (
            patch("src.nodes.faq.maybe_escalate_financing_detail", return_value=None),
            patch(
                "src.utils.financing_advisor_notify.get_bot_settings",
                return_value={"downPaymentMessage": msg},
            ),
            patch("src.nodes.faq.fetch_faq_candidates") as fetch_mock,
        ):
            out = faq(dict(state))
        fetch_mock.assert_not_called()
        msgs = [m.get("content", "") for m in out.get("messages", []) if m.get("role") == "assistant"]
        self.assertEqual(msgs.count(msg), 1)
        self.assertEqual(out.get("current_node"), "router")
