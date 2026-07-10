"""Escalacion por dudas detalladas de financiamiento."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from src.nodes.faq import faq
from src.nodes.financing import financing
from src.nodes.intent_checker import intent_checker
from src.nodes.router import router
from src.utils.financing_advisor_notify import (
    handle_financing_detail_escalation,
    is_financing_catalog_request,
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
        self.assertEqual(ev.call_args[0][0].get("message"), "financing_detail_escalation")
        payload = mock_post.call_args[1]["json"]
        self.assertEqual(payload.get("body"), "6181556489 necesita ayuda para resolver dudas")
        self.assertEqual(payload.get("title"), "Cliente necesita ayuda")
        self.assertEqual(payload.get("data", {}).get("notification_kind"), "financing_detail_help")
        self.assertEqual(payload.get("data", {}).get("conversationId"), "conv-uuid")


class TestIsFinancingCatalogRequest(unittest.TestCase):
    def test_detects_plan_catalog_browse_with_typo(self) -> None:
        self.assertTrue(is_financing_catalog_request("planes de financieamiento"))

    def test_detects_standard_catalog_phrases(self) -> None:
        self.assertTrue(is_financing_catalog_request("que planes de financiamiento tienen"))
        self.assertTrue(is_financing_catalog_request("cuales son las tasas"))

    def test_rejects_personalized_credit_questions(self) -> None:
        self.assertFalse(is_financing_catalog_request("me aprueban con mal buro"))
        self.assertFalse(is_financing_catalog_request("puedo financiar con comprobante informal"))


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


    def test_skips_catalog_request_without_llm(self) -> None:
        state = _state_with_bot_exchange(user="planes de financieamiento", bot="Hola Javier")
        with patch(
            "src.utils.financing_advisor_notify.classify_financing_detail_escalation",
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

    def test_customer_onboarding_skips_faq_interrupt(self) -> None:
        state = _state_with_bot_exchange(
            user="revisan buro de credito",
            bot="Hola Javier, en que te ayudo?",
            node="customer_onboarding",
        )
        with (
            patch(
                "src.nodes.intent_checker.maybe_escalate_financing_detail",
                return_value=None,
            ),
        ):
            out = intent_checker(dict(state))
        self.assertFalse(out.get("is_faq_interrupt"))
        self.assertEqual(out.get("current_node"), "customer_onboarding")

    def test_customer_onboarding_escalates_affirmative_bureau_followup(self) -> None:
        state = _state_with_bot_exchange(
            user="Si por favor",
            bot="Te gustaria que te explique como funciona el proceso de revision del buro de credito?",
            node="customer_onboarding",
        )
        with (
            patch(
                "src.nodes.intent_checker.maybe_escalate_financing_detail",
            ) as escalate_mock,
        ):
            escalated = {**state, "financing_detail_push_sent": True, "bot_disabled": True}
            escalate_mock.return_value = escalated
            out = intent_checker(dict(state))
        escalate_mock.assert_called_once()
        self.assertTrue(out.get("financing_detail_push_sent"))


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
            patch("src.nodes.intent_checker.classify_financing_step_flags") as step_mock,
            patch("src.nodes.intent_checker.handle_financing_detail_escalation") as escalate_mock,
        ):
            escalated = {**state, "financing_detail_push_sent": True, "bot_disabled": True}
            escalate_mock.return_value = escalated
            out = intent_checker(dict(state))
        step_mock.assert_not_called()
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
            with patch("src.nodes.financing.classify_financing_step_flags", return_value={}):
                with patch("src.nodes.financing.fetch_financing_plans", return_value=[]):
                    out = financing(dict(state))
        escalate_mock.assert_not_called()
        self.assertFalse(out.get("financing_detail_push_sent"))
        self.assertFalse(out.get("bot_disabled"))


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
