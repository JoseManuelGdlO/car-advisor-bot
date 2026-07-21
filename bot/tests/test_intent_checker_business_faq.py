from __future__ import annotations

import unittest
from unittest.mock import patch

from src.nodes.intent_checker import intent_checker
from src.utils.signals import is_business_faq_question
from tests.test_helpers import GraphTestCase, initial_state, with_user_message


class BusinessFaqHeuristicTests(unittest.TestCase):
    def test_detects_hours_question(self) -> None:
        self.assertTrue(is_business_faq_question("Y qué horario manejan?"))

    def test_detects_location_question(self) -> None:
        self.assertTrue(is_business_faq_question("Dónde están ubicados?"))

    def test_detects_maintenance_service_location(self) -> None:
        self.assertTrue(is_business_faq_question("Donde hacen los servicios de mantenimiento?"))
        self.assertTrue(is_business_faq_question("¿Dónde está el taller?"))
        self.assertTrue(is_business_faq_question("Quiero la dirección del área de servicio"))
        self.assertTrue(is_business_faq_question("¿Venden refacciones?"))

    def test_detects_used_or_seminuevos_policy_question(self) -> None:
        self.assertTrue(is_business_faq_question("Tendrán seminuevos saludos"))
        self.assertTrue(is_business_faq_question("Tienen autos seminuevos?"))
        self.assertTrue(is_business_faq_question("¿Manejan autos usados?"))
        self.assertTrue(is_business_faq_question("Venden carros de segunda?"))

    def test_does_not_detect_purchase_confirmation(self) -> None:
        self.assertFalse(is_business_faq_question("Sí, quiero comprarlo"))


class IntentCheckerBusinessFaqTests(unittest.TestCase):
    def _purchase_confirmation_state(self, user_message: str) -> dict:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["awaiting_purchase_confirmation"] = True
        state["selected_car"] = "Suzuki JIMNY 2027 2027"
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Estamos ubicados en Centro. ¿Seguimos con el Jimny?",
                "type": "AIMessage",
            },
            {"role": "user", "content": user_message, "type": "HumanMessage"},
        ]
        return state

    def test_hours_question_not_blocked_by_confirm_purchase_flag(self) -> None:
        state = self._purchase_confirmation_state("Y qué horario manejan?")
        vehicle_flags = {
            "ask_promotions": False,
            "ask_financing": False,
            "ask_images": False,
            "ask_more_images": False,
            "wants_other_vehicles": False,
            "confirm_purchase": True,
            "reject_purchase": False,
        }
        with (
            patch("src.nodes.intent_checker.classify_vehicle_step_flags", return_value=vehicle_flags) as mock_vehicle,
            patch(
                "src.nodes.intent_checker.classify_faq_interrupt_flags",
                return_value={"interrumpir_por_faq": True},
            ) as mock_faq,
        ):
            out = intent_checker(dict(state))

        mock_vehicle.assert_not_called()
        mock_faq.assert_called_once()
        self.assertTrue(out.get("is_faq_interrupt"))
        self.assertEqual(out.get("current_node"), "faq")
        self.assertEqual(out.get("resume_to_step"), "car_selection")

    def test_seminuevos_question_not_blocked_by_wants_other_vehicles(self) -> None:
        state = self._purchase_confirmation_state("Tendrán seminuevos saludos")
        vehicle_flags = {
            "ask_promotions": False,
            "ask_financing": False,
            "ask_images": False,
            "ask_more_images": False,
            "wants_other_vehicles": True,
            "confirm_purchase": False,
            "reject_purchase": False,
        }
        with (
            patch("src.nodes.intent_checker.classify_vehicle_step_flags", return_value=vehicle_flags) as mock_vehicle,
            patch(
                "src.nodes.intent_checker.classify_faq_interrupt_flags",
                return_value={"interrumpir_por_faq": True},
            ) as mock_faq,
        ):
            out = intent_checker(dict(state))

        mock_vehicle.assert_not_called()
        mock_faq.assert_called_once()
        self.assertTrue(out.get("is_faq_interrupt"))
        self.assertEqual(out.get("current_node"), "faq")
        self.assertEqual(out.get("resume_to_step"), "car_selection")

    def test_financing_request_still_blocks_faq(self) -> None:
        state = self._purchase_confirmation_state("¿Tienen financiamiento para este auto?")
        vehicle_flags = {
            "ask_promotions": False,
            "ask_financing": True,
            "ask_images": False,
            "ask_more_images": False,
            "wants_other_vehicles": False,
            "confirm_purchase": False,
            "reject_purchase": False,
        }
        with (
            patch("src.nodes.intent_checker.classify_vehicle_step_flags", return_value=vehicle_flags) as mock_vehicle,
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags") as mock_faq,
        ):
            out = intent_checker(dict(state))

        mock_vehicle.assert_called_once()
        mock_faq.assert_not_called()
        self.assertFalse(out.get("is_faq_interrupt"))

    def test_address_for_visit_routes_to_lead_capture_over_faq(self) -> None:
        state = self._purchase_confirmation_state("Me pasa dirección para ir por favor?")
        with (
            patch("src.nodes.intent_checker.classify_vehicle_step_flags") as mock_vehicle,
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags") as mock_faq,
        ):
            out = intent_checker(dict(state))

        mock_vehicle.assert_not_called()
        mock_faq.assert_not_called()
        self.assertFalse(out.get("is_faq_interrupt"))
        self.assertEqual(out.get("current_node"), "lead_capture")
        self.assertEqual(out.get("intent"), "lead_capture")

    def test_plain_location_question_still_goes_to_faq(self) -> None:
        state = self._purchase_confirmation_state("Dónde están ubicados?")
        with (
            patch("src.nodes.intent_checker.classify_vehicle_step_flags") as mock_vehicle,
            patch(
                "src.nodes.intent_checker.classify_faq_interrupt_flags",
                return_value={"interrumpir_por_faq": True},
            ) as mock_faq,
        ):
            out = intent_checker(dict(state))

        mock_vehicle.assert_not_called()
        mock_faq.assert_called_once()
        self.assertTrue(out.get("is_faq_interrupt"))
        self.assertEqual(out.get("current_node"), "faq")


class BusinessFaqDuringPurchaseFlowTests(GraphTestCase):
    def test_hours_faq_after_location_faq_does_not_route_to_lead_capture(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["awaiting_purchase_confirmation"] = True
        state["selected_car"] = "Suzuki JIMNY 2027 2027"
        state["selected_vehicle_id"] = "veh-jimny"
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Estamos ubicados en Centro. ¿Seguimos con el Jimny?",
                "type": "AIMessage",
            }
        ]
        state = with_user_message(state, "Y qué horario manejan?")

        def faq_flags(_current_node: str, _last_bot: str, user_message: str, **_kwargs: object) -> dict[str, bool]:
            return {"interrumpir_por_faq": "horario" in user_message.lower()}

        with (
            patch("src.nodes.intent_checker.classify_vehicle_step_flags") as mock_vehicle_flags,
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", side_effect=faq_flags),
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["Lunes a viernes de 9 a 18 h."]),
            patch("src.nodes.faq.generate_faq_resume_transition", return_value="¿Seguimos con el Jimny?"),
            patch("src.nodes.faq.generate_faq_user_turn", return_value="Abrimos de 9 a 18 h."),
            patch("src.nodes.lead_capture.notify_advisor") as notify_mock,
        ):
            updated = self.graph.invoke(state)

        mock_vehicle_flags.assert_not_called()
        notify_mock.assert_not_called()
        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        self.assertIn("9 a 18", updated["messages"][-1]["content"])

    def test_address_for_visit_mid_purchase_goes_to_lead_capture(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["awaiting_purchase_confirmation"] = True
        state["selected_car"] = "Suzuki DZIRE BOOSTERGREEN 2026"
        state["selected_vehicle_id"] = "veh-dzire"
        state["owner_user_id"] = "owner-1"
        state["user_id"] = "user-1"
        state["messages"] = [
            {
                "role": "assistant",
                "content": "¿Te interesa agendar una prueba de manejo o ver este vehículo en persona?",
                "type": "AIMessage",
            }
        ]
        state = with_user_message(state, "Me pasa dirección para ir por favor?")

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags") as mock_faq,
            patch("src.nodes.lead_capture.classify_lead_capture_navigation", return_value=""),
            patch(
                "src.nodes.lead_capture.generate_lead_capture_scheduling_message",
                return_value="Agenda tu visita aquí: https://cal.example/x",
            ),
            patch("src.nodes.lead_capture.notify_advisor") as notify_mock,
            patch("src.nodes.lead_capture.push_event_to_backend") as event_mock,
            patch(
                "src.nodes.lead_capture.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
        ):
            updated = self.graph.invoke(state)

        mock_faq.assert_not_called()
        notify_mock.assert_called_once()
        event_mock.assert_called_once()
        self.assertTrue(updated.get("lead_capture_done"))
        self.assertIn("Agenda tu visita", updated["messages"][-1]["content"])

    def test_plain_location_faq_mid_purchase_uses_schedule_close(self) -> None:
        state = initial_state()
        state["current_node"] = "car_selection"
        state["awaiting_purchase_confirmation"] = True
        state["selected_car"] = "Suzuki JIMNY 2027 2027"
        state["selected_vehicle_id"] = "veh-jimny"
        state["messages"] = [
            {
                "role": "assistant",
                "content": "¿Te interesa el Jimny?",
                "type": "AIMessage",
            }
        ]
        state = with_user_message(state, "Dónde están ubicados?")

        captured: dict[str, object] = {}

        def capture_faq_turn(**kwargs: object) -> str:
            captured.update(kwargs)
            return "Estamos en Centro. ¿Te gustaría agendar una cita?"

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": True}),
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["Estamos en Av. Centro 123."]),
            patch("src.nodes.faq.generate_faq_resume_transition") as mock_resume,
            patch("src.nodes.faq.generate_faq_user_turn", side_effect=capture_faq_turn),
            patch("src.nodes.lead_capture.notify_advisor") as notify_mock,
        ):
            updated = self.graph.invoke(state)

        mock_resume.assert_not_called()
        notify_mock.assert_not_called()
        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        self.assertEqual(captured.get("faq_close_topic"), "ubicacion")
        self.assertIn("agendar una cita", str(captured.get("transition_literal", "")).lower())
        self.assertIn("agendar una cita", updated["messages"][-1]["content"].lower())


if __name__ == "__main__":
    unittest.main()
