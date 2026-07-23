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
        self.assertEqual(ev.call_args[0][0].get("message"), "Cliente pidió hablar con un asesor")
        self.assertEqual(ev.call_args[0][0].get("from"), "system")
        mock_post.assert_called_once()
        payload = mock_post.call_args[1]["json"]
        self.assertEqual(payload.get("title"), "Cliente necesita ayuda")
        self.assertEqual(payload.get("body"), "5512345678 necesita ayuda para resolver dudas")
        self.assertEqual(payload.get("data", {}).get("notification_kind"), "human_advisor")
        msgs = out.get("messages") or []
        self.assertTrue(msgs and msgs[-1].get("role") == "assistant")
        ack = str(msgs[-1].get("content", "")).lower()
        self.assertIn("contacten", ack)
        self.assertNotIn("asesor", ack)
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

    def test_ack_first_contact_without_otra_vez(self) -> None:
        state = initial_state()
        ack = _user_handoff_ack(state, notify_ok=True, prior_advisor_contact=False)
        self.assertIn("contacten", ack.lower())
        self.assertNotIn("otra vez", ack.lower())

    def test_ack_repeat_contact_uses_otra_vez(self) -> None:
        state = initial_state()
        ack = _user_handoff_ack(state, notify_ok=True, prior_advisor_contact=True)
        self.assertIn("otra vez", ack.lower())

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

    def test_appends_visit_incentive_before_ack_when_configured(self) -> None:
        state = with_user_message(initial_state(), "Necesito un asesor")
        state["user_id"] = "u1"
        state["platform"] = "web"
        state["owner_user_id"] = "owner-uuid"
        state["current_node"] = "car_selection"
        with (
            patch("src.utils.human_advisor_notify.push_event_to_backend"),
            patch("src.utils.human_advisor_notify.notify_advisor", return_value=True),
            patch(
                "src.utils.human_advisor_notify.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
            patch(
                "src.utils.financing_advisor_notify.get_bot_settings",
                return_value={
                    "visitIncentiveMessage": "Te invitamos a visitarnos en la agencia",
                },
            ),
        ):
            out = handle_human_advisor_request(dict(state))
        msgs = [m.get("content", "") for m in out.get("messages", []) if m.get("role") == "assistant"]
        tail = msgs[-2:]
        self.assertEqual(len(tail), 2)
        self.assertEqual(tail[0], "Te invitamos a visitarnos en la agencia")
        self.assertIn("contacten", tail[1].lower())

    def test_skips_visit_incentive_when_not_configured(self) -> None:
        state = with_user_message(initial_state(), "Necesito un asesor")
        state["user_id"] = "u1"
        state["platform"] = "web"
        state["owner_user_id"] = "owner-uuid"
        state["current_node"] = "car_selection"
        with (
            patch("src.utils.human_advisor_notify.push_event_to_backend"),
            patch("src.utils.human_advisor_notify.notify_advisor", return_value=True),
            patch(
                "src.utils.human_advisor_notify.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
            patch(
                "src.utils.financing_advisor_notify.get_bot_settings",
                return_value={"visitIncentiveMessage": None},
            ),
        ):
            out = handle_human_advisor_request(dict(state))
        msgs = [m.get("content", "") for m in out.get("messages", []) if m.get("role") == "assistant"]
        tail = msgs[-1:]
        self.assertEqual(len(tail), 1)
        self.assertIn("contacten", tail[0].lower())
        self.assertNotIn("agencia", tail[0].lower())


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


    def test_scheduling_request_routes_to_lead_capture_not_human_advisor(self) -> None:
        state = initial_state()
        state["current_node"] = "promotions"
        state["selected_vehicle_id"] = "veh-jimny"
        state["selected_car"] = "Suzuki Jimny 5 Puertas 2025"
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Claro, aqui tienes las promociones disponibles...",
                "type": "AIMessage",
            },
            {"role": "user", "content": "Okey, quiero agendar una cita", "type": "HumanMessage"},
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
        self.assertEqual(out.get("current_node"), "lead_capture")
        self.assertEqual(out.get("intent"), "lead_capture")
        self.assertEqual(out.get("contact_method"), "appointment")
        self.assertFalse(out.get("human_advisor_push_sent"))
        self.assertFalse(out.get("suppress_commercial_node_once"))

    def test_scheduling_without_selected_car_does_not_route_to_lead_capture(self) -> None:
        state = initial_state()
        state["current_node"] = "promotions"
        state["selected_vehicle_id"] = "veh-jimny"
        state["selected_car"] = ""
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Claro, aqui tienes las promociones disponibles...",
                "type": "AIMessage",
            },
            {"role": "user", "content": "Okey, quiero agendar una cita", "type": "HumanMessage"},
        ]
        flags = {
            "interrumpir_por_faq": False,
            "quiere_asesor_humano": True,
            "tema_vehiculo_inventario": False,
            "tema_financiamiento_credi": False,
            "es_respuesta_o_seguimiento_al_ultimo_bot": True,
        }
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value=flags),
            patch("src.utils.human_advisor_notify.push_event_to_backend"),
            patch("src.utils.human_advisor_notify.deactivate_bot", side_effect=lambda s, **_: s),
        ):
            out = intent_checker(dict(state))
        self.assertNotEqual(out.get("current_node"), "lead_capture")
        self.assertNotEqual(out.get("intent"), "lead_capture")

    def test_financing_buro_question_routes_to_faq_without_commercial_heuristic(self) -> None:
        state = initial_state()
        state["current_node"] = "financing"
        state["awaiting_financing_plan_selection"] = True
        state["selected_vehicle_id"] = "veh-dzire"
        state["selected_car"] = "Suzuki DZIRE BOOSTERGREEN 2026 2026"
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Si te interesa uno en particular, dime el nombre o numero del plan.",
                "type": "AIMessage",
            },
            {"role": "user", "content": "revisan buro de credito", "type": "HumanMessage"},
        ]
        flags = {
            "interrumpir_por_faq": True,
            "quiere_asesor_humano": False,
            "tema_vehiculo_inventario": False,
            "tema_financiamiento_credi": False,
            "es_respuesta_o_seguimiento_al_ultimo_bot": False,
        }
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value=flags),
            patch(
                "src.nodes.intent_checker.classify_financing_step_flags",
                return_value={
                    "ask_promotions": False,
                    "ask_other_vehicles": False,
                    "ask_financing_with_vehicle": False,
                    "wants_compare_two_plans": False,
                    "select_plan": False,
                    "ask_plan_vehicle_info": False,
                    "reject_financing_keep_purchase": False,
                    "ask_explicit_plan": True,
                },
            ),
        ):
            out = intent_checker(dict(state))
        self.assertTrue(out.get("is_faq_interrupt"))
        self.assertEqual(out.get("current_node"), "faq")
        self.assertEqual(out.get("resume_to_step"), "financing")


class TestRouterHumanAdvisor(unittest.TestCase):
    def test_llm_human_advisor_via_classifier(self) -> None:
        state = with_user_message(initial_state(), "Quiero hablar con un asesor")
        state["owner_user_id"] = ""
        with (
            patch("src.nodes.router.classify_router_intent", return_value="HUMAN_ADVISOR"),
            patch("src.utils.human_advisor_notify.push_event_to_backend"),
            patch("src.utils.human_advisor_notify.deactivate_bot", side_effect=lambda s, **_: s),
        ):
            out = router(dict(state))
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
