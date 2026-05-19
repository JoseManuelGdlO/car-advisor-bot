"""Escalacion a asesor humano: router, intent_checker y helper de notificacion."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from src.nodes.intent_checker import intent_checker
from src.nodes.router import router
from src.utils.human_advisor_notify import (
    _user_handoff_ack,
    handle_human_advisor_request,
    human_advisor_heuristic_match,
)
from tests.test_helpers import initial_state, with_user_message


class TestHumanAdvisorHeuristic(unittest.TestCase):
    def test_heuristic_match_detects_explicit_phrase(self) -> None:
        self.assertEqual(human_advisor_heuristic_match("Quiero hablar con un asesor"), "hablar con un asesor")
        self.assertIsNone(human_advisor_heuristic_match("Busco un SUV 2022"))

    def test_vehicle_browse_phrase_not_heuristic_human(self) -> None:
        self.assertIsNone(human_advisor_heuristic_match("Quiero ver el toyota RAV4"))


class TestHandleHumanAdvisorRequest(unittest.TestCase):
    def test_idempotent_second_call_skips_push(self) -> None:
        state = with_user_message(initial_state(), "Hola")
        state["user_id"] = "u1"
        state["platform"] = "web"
        state["owner_user_id"] = "owner-uuid"
        state["current_node"] = "router"
        state["human_advisor_push_sent"] = True
        before_n = len(state.get("messages", []))
        out = handle_human_advisor_request(dict(state))
        self.assertEqual(len(out.get("messages", [])), before_n)

    def test_push_and_event_once(self) -> None:
        state = with_user_message(initial_state(), "Necesito un asesor")
        state["user_id"] = "u1"
        state["platform"] = "web"
        state["owner_user_id"] = "owner-uuid"
        state["current_node"] = "car_selection"
        state["selected_car"] = "Toyota Corolla 2023"
        state["customer_info"] = {"nombre": "Ana", "telefono": "5512345678"}

        mock_post = MagicMock()
        mock_post.return_value.raise_for_status = MagicMock()

        with (
            patch("src.utils.human_advisor_notify.push_event_to_backend") as ev,
            patch("src.tools.vehicles.requests.post", mock_post),
            patch("src.utils.human_advisor_notify.deactivate_bot", side_effect=lambda s, **_: s),
        ):
            out = handle_human_advisor_request(dict(state))

        self.assertTrue(out.get("human_advisor_push_sent"))
        self.assertTrue(out.get("human_advisor_requested"))
        ev.assert_called_once()
        self.assertEqual(ev.call_args[0][0].get("message"), "human_advisor_requested")
        mock_post.assert_called_once()
        payload = mock_post.call_args[1]["json"]
        self.assertEqual(payload.get("title"), "Solicitud de asesor humano")
        self.assertIn("solicito hablar con un asesor", (payload.get("body") or "").lower())
        self.assertEqual(payload.get("data", {}).get("notification_kind"), "human_advisor")
        msgs = out.get("messages") or []
        self.assertTrue(msgs and msgs[-1].get("role") == "assistant")
        ack = str(msgs[-1].get("content", "")).lower()
        self.assertIn("asesor", ack)
        self.assertNotIn("sigo aqui", ack)

    def test_ack_without_asesor_when_contact_complete(self) -> None:
        state = initial_state()
        state["customer_info"] = {
            "nombre": "Ana",
            "telefono": "5512345678",
            "email": "ana@test.com",
        }
        ack = _user_handoff_ack(state, notify_ok=True)
        self.assertNotIn("asesor", ack.lower())
        self.assertIn("contactamos", ack.lower())

    def test_deactivates_bot_after_notify(self) -> None:
        state = with_user_message(initial_state(), "Necesito un asesor")
        state["owner_user_id"] = "owner-uuid"
        with (
            patch("src.utils.human_advisor_notify.push_event_to_backend"),
            patch("src.tools.vehicles.requests.post") as mock_post,
            patch(
                "src.utils.bot_control.set_conversation_human_controlled",
                return_value=True,
            ),
        ):
            mock_post.return_value.raise_for_status = MagicMock()
            out = handle_human_advisor_request(dict(state))
        self.assertTrue(out.get("bot_disabled"))


class TestIntentCheckerHumanAdvisor(unittest.TestCase):
    def test_promotions_vehicle_followup_not_human_even_if_llm_flags_human(self) -> None:
        state = initial_state()
        state["current_node"] = "promotions"
        state["awaiting_promotion_selection"] = True
        state["selected_promotion_id"] = "promo-1"
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Si deseas contactar a un asesor para mas detalles, hazmelo saber.",
                "type": "AIMessage",
            },
            {"role": "user", "content": "Quiero ver el toyota RAV4", "type": "HumanMessage"},
        ]
        flags = {
            "interrumpir_por_faq": False,
            "quiere_asesor_humano": True,
            "tema_vehiculo_inventario": False,
            "tema_financiamiento_credi": False,
            "es_respuesta_o_seguimiento_al_ultimo_bot": True,
        }
        with patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value=flags):
            out = intent_checker(dict(state))
        self.assertFalse(out.get("is_faq_interrupt"))
        self.assertFalse(out.get("suppress_commercial_node_once"))
        self.assertFalse(out.get("human_advisor_push_sent"))

    def test_human_flag_runs_before_faq_interrupt(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["messages"] = [
            {"role": "assistant", "content": "Te muestro el detalle del vehiculo.", "type": "AIMessage"},
            {"role": "user", "content": "Quiero hablar con un asesor humano", "type": "HumanMessage"},
        ]
        flags = {
            "interrumpir_por_faq": True,
            "quiere_asesor_humano": True,
            "tema_vehiculo_inventario": False,
            "tema_financiamiento_credi": False,
            "es_respuesta_o_seguimiento_al_ultimo_bot": False,
        }
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value=flags),
            patch("src.utils.human_advisor_notify.push_event_to_backend"),
            patch("src.tools.vehicles.requests.post") as mock_post,
            patch(
                "src.utils.bot_control.set_conversation_human_controlled",
                return_value=True,
            ),
        ):
            mock_post.return_value.raise_for_status = MagicMock()
            out = intent_checker(dict(state))
        self.assertEqual(out.get("current_node"), "car_selection")
        self.assertFalse(out.get("is_faq_interrupt"))
        self.assertTrue(out.get("suppress_commercial_node_once"))
        self.assertTrue(out.get("human_advisor_push_sent"))
        self.assertTrue(out.get("bot_disabled"))

    def test_human_duplicate_no_suppress_without_new_assistant_message(self) -> None:
        state = initial_state()
        state["current_node"] = "promotions"
        state["human_advisor_push_sent"] = True
        state["messages"] = [
            {"role": "assistant", "content": "Detalle de promo.", "type": "AIMessage"},
            {"role": "user", "content": "Otra vez quiero un asesor", "type": "HumanMessage"},
        ]
        flags = {
            "interrumpir_por_faq": False,
            "quiere_asesor_humano": True,
            "tema_vehiculo_inventario": False,
            "tema_financiamiento_credi": False,
            "es_respuesta_o_seguimiento_al_ultimo_bot": True,
        }
        with patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value=flags):
            out = intent_checker(dict(state))
        self.assertFalse(out.get("suppress_commercial_node_once"))


class TestRouterHumanAdvisor(unittest.TestCase):
    def test_heuristic_short_circuits_before_financing(self) -> None:
        state = with_user_message(initial_state(), "Quiero hablar con un asesor")
        state["owner_user_id"] = ""
        with (
            patch("src.nodes.router.classify_router_intent") as mock_cls,
            patch("src.utils.human_advisor_notify.push_event_to_backend"),
            patch("src.utils.human_advisor_notify.deactivate_bot", side_effect=lambda s, **_: s),
        ):
            out = router(dict(state))
        mock_cls.assert_not_called()
        self.assertEqual(out.get("intent"), "human_advisor")
        self.assertEqual(out.get("current_node"), "router")
        self.assertTrue(out.get("human_advisor_push_sent"))

    def test_llm_human_advisor_resolution(self) -> None:
        state = with_user_message(initial_state(), "Me gustaria que me contacte una persona del equipo")
        state["owner_user_id"] = ""
        with (
            patch("src.nodes.router.classify_router_intent", return_value="HUMAN_ADVISOR"),
            patch("src.utils.human_advisor_notify.push_event_to_backend"),
            patch("src.utils.human_advisor_notify.deactivate_bot", side_effect=lambda s, **_: s),
        ):
            out = router(dict(state))
        self.assertEqual(out.get("intent"), "human_advisor")
        self.assertTrue(out.get("human_advisor_push_sent"))
