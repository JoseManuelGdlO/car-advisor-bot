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


if __name__ == "__main__":
    unittest.main()
