from __future__ import annotations

import unittest
from unittest.mock import patch

from src.nodes.faq import faq
from src.services.llm_responses import (
    _FAQ_RESUME_TRANSITION_FALLBACKS,
    _faq_resume_transition_fallback,
    generate_faq_resume_transition,
)
from src.state import clientState
from src.utils.purchase_flow_messages import (
    CONTACT_PREFERENCE_MESSAGE,
    LEAD_CONTACT_FOLLOWUP_WHATSAPP_CALL,
    PURCHASE_PREFERENCES_REASK_BOTH,
)


class GenerateFaqResumeTransitionTests(unittest.TestCase):
    def test_selected_car_fallback_avoids_catalog_prompt(self) -> None:
        snapshot = {
            "selected_car": "Toyota Corolla LE 2021",
            "has_selected_car": True,
            "awaiting_purchase_preferences": False,
            "awaiting_purchase_confirmation": False,
            "contact_method": "",
            "pending_vehicle_candidates": 0,
            "financing_plan_name": "",
            "has_financing_plan": False,
            "awaiting_financing_plan_selection": False,
            "awaiting_financing_vehicle_selection": False,
            "promotion_title": "",
            "has_promotion": False,
            "awaiting_promotion_selection": False,
            "awaiting_promotion_vehicle_selection": False,
            "awaiting_promotion_vehicle_interest_confirmation": False,
            "awaiting_promotion_apply_confirmation": False,
        }
        out = _faq_resume_transition_fallback("car_selection", snapshot)
        self.assertIn("Toyota Corolla", out)
        self.assertNotIn("modelos disponibles", out.lower())
        self.assertNotIn("vehículo en mente", out.lower())

    def test_contact_preference_fallback_uses_fixed_literal(self) -> None:
        snapshot = {
            "selected_car": "Toyota Corolla LE 2021",
            "has_selected_car": True,
            "awaiting_purchase_preferences": False,
            "awaiting_purchase_confirmation": True,
            "contact_method": "",
            "pending_vehicle_candidates": 0,
            "financing_plan_name": "",
            "has_financing_plan": False,
            "awaiting_financing_plan_selection": False,
            "awaiting_financing_vehicle_selection": False,
            "promotion_title": "",
            "has_promotion": False,
            "awaiting_promotion_selection": False,
            "awaiting_promotion_vehicle_selection": False,
            "awaiting_promotion_vehicle_interest_confirmation": False,
            "awaiting_promotion_apply_confirmation": False,
        }
        out = _faq_resume_transition_fallback("car_selection", snapshot)
        self.assertEqual(out, CONTACT_PREFERENCE_MESSAGE)

    def test_preferences_fallback_uses_fixed_reask(self) -> None:
        snapshot = {
            "selected_car": "Nissan Versa",
            "has_selected_car": True,
            "awaiting_purchase_preferences": True,
            "awaiting_purchase_confirmation": False,
            "contact_method": "",
            "pending_vehicle_candidates": 0,
            "financing_plan_name": "",
            "has_financing_plan": False,
            "awaiting_financing_plan_selection": False,
            "awaiting_financing_vehicle_selection": False,
            "promotion_title": "",
            "has_promotion": False,
            "awaiting_promotion_selection": False,
            "awaiting_promotion_vehicle_selection": False,
            "awaiting_promotion_vehicle_interest_confirmation": False,
            "awaiting_promotion_apply_confirmation": False,
        }
        out = _faq_resume_transition_fallback("car_selection", snapshot)
        self.assertEqual(out, PURCHASE_PREFERENCES_REASK_BOTH)

    def test_financing_with_plan_fallback_continues_plan(self) -> None:
        snapshot = {
            "selected_car": "Nissan Versa",
            "has_selected_car": True,
            "awaiting_purchase_preferences": False,
            "awaiting_purchase_confirmation": False,
            "contact_method": "",
            "pending_vehicle_candidates": 0,
            "financing_plan_name": "Plan 24 meses",
            "has_financing_plan": True,
            "awaiting_financing_plan_selection": False,
            "awaiting_financing_vehicle_selection": False,
            "promotion_title": "",
            "has_promotion": False,
            "awaiting_promotion_selection": False,
            "awaiting_promotion_vehicle_selection": False,
            "awaiting_promotion_vehicle_interest_confirmation": False,
            "awaiting_promotion_apply_confirmation": False,
        }
        out = _faq_resume_transition_fallback("financing", snapshot)
        self.assertIn("Plan 24 meses", out)

    def test_lead_whatsapp_fallback_avoids_agenda(self) -> None:
        snapshot = {
            "selected_car": "Toyota Corolla",
            "has_selected_car": True,
            "awaiting_purchase_preferences": False,
            "awaiting_purchase_confirmation": False,
            "contact_method": "whatsapp",
            "pending_vehicle_candidates": 0,
            "financing_plan_name": "",
            "has_financing_plan": False,
            "awaiting_financing_plan_selection": False,
            "awaiting_financing_vehicle_selection": False,
            "promotion_title": "",
            "has_promotion": False,
            "awaiting_promotion_selection": False,
            "awaiting_promotion_vehicle_selection": False,
            "awaiting_promotion_vehicle_interest_confirmation": False,
            "awaiting_promotion_apply_confirmation": False,
        }
        out = _faq_resume_transition_fallback("lead_capture", snapshot)
        self.assertEqual(out, LEAD_CONTACT_FOLLOWUP_WHATSAPP_CALL)
        self.assertNotIn("agendar", out.lower())

    def test_empty_last_bot_message_returns_step_fallback(self) -> None:
        out = generate_faq_resume_transition(
            user_message="¿Dónde están ubicados?",
            last_bot_message="",
            resume_to_step="lead_capture",
            state={"selected_car": "Toyota Corolla LE 2021"},
        )
        self.assertIn("Toyota Corolla", out)

    def test_unknown_step_uses_generic_fallback(self) -> None:
        out = generate_faq_resume_transition(
            user_message="horarios?",
            last_bot_message="",
            resume_to_step="unknown_step",
        )
        self.assertIn("Continuemos", out)

    @patch("src.services.llm_responses.generate_verified_user_message")
    def test_purchase_confirmation_skips_llm(self, mock_verified) -> None:
        out = generate_faq_resume_transition(
            user_message="¿ubicación?",
            last_bot_message="¿Prefieres WhatsApp, llamada o cita?",
            resume_to_step="car_selection",
            state={
                "selected_car": "Nissan Versa 2004",
                "awaiting_purchase_confirmation": True,
            },
        )
        self.assertEqual(out, CONTACT_PREFERENCE_MESSAGE)
        mock_verified.assert_not_called()

    @patch("src.services.llm_responses.generate_verified_user_message")
    def test_purchase_preferences_skips_llm(self, mock_verified) -> None:
        out = generate_faq_resume_transition(
            user_message="¿horarios?",
            last_bot_message="¿Automático o Estándar?",
            resume_to_step="car_selection",
            state={
                "selected_car": "Nissan Versa 2004",
                "awaiting_purchase_preferences": True,
            },
        )
        self.assertEqual(out, PURCHASE_PREFERENCES_REASK_BOTH)
        mock_verified.assert_not_called()

    @patch("src.services.llm_responses.generate_verified_user_message")
    def test_invokes_llm_with_flow_state_in_verified_block(self, mock_verified) -> None:
        mock_verified.return_value = "¿Seguimos con el Versa?"
        generate_faq_resume_transition(
            user_message="¿ubicación?",
            last_bot_message="Elige un modelo de la lista.",
            resume_to_step="car_selection",
            state={
                "selected_car": "Nissan Versa 2004",
                "awaiting_purchase_confirmation": False,
            },
        )
        facts = mock_verified.call_args.kwargs["verified_facts_block"]
        self.assertIn("vehiculo_seleccionado: Nissan Versa 2004", facts)
        self.assertIn("esperando_preferencia_contacto: false", facts)
        self.assertIn("esperando_confirmacion_compra: false", facts)

    @patch("src.services.llm_responses.generate_verified_user_message")
    def test_invokes_llm_with_faq_resume_transition_mode(self, mock_verified) -> None:
        mock_verified.return_value = "¿Seguimos con el enlace de agenda?"
        out = generate_faq_resume_transition(
            user_message="¿ubicación?",
            last_bot_message="Usa el enlace para agendar.",
            resume_to_step="lead_capture",
            state={"contact_method": "appointment", "selected_car": "Toyota Corolla"},
        )
        self.assertEqual(out, "¿Seguimos con el enlace de agenda?")
        mock_verified.assert_called_once()
        kwargs = mock_verified.call_args.kwargs
        self.assertEqual(kwargs["mode"], "faq_resume_transition")
        self.assertIn("paso_a_reanudar: lead_capture", kwargs["verified_facts_block"])
        self.assertIn("estado_flujo:", kwargs["verified_facts_block"])
        self.assertIn("vehiculo_seleccionado:", kwargs["verified_facts_block"])
        self.assertIn("ultimo_mensaje_bot:", kwargs["verified_facts_block"])
        self.assertIn("mensaje_usuario_faq:", kwargs["verified_facts_block"])

    @patch("src.services.llm_responses.generate_verified_user_message")
    def test_llm_failure_uses_fallback_from_mock(self, mock_verified) -> None:
        mock_verified.side_effect = lambda **kw: kw["fallback"]
        out = generate_faq_resume_transition(
            user_message="garantía?",
            last_bot_message="Elige un plan de financiamiento.",
            resume_to_step="financing",
        )
        self.assertEqual(out, _FAQ_RESUME_TRANSITION_FALLBACKS["financing"])


class FaqNodeResumeTransitionWiringTests(unittest.TestCase):
    @patch("src.nodes.faq.generate_faq_user_turn", return_value="FAQ + transición")
    @patch("src.nodes.faq.fetch_faq_candidates", return_value=["Ubicación: Centro."])
    @patch(
        "src.nodes.faq.generate_faq_resume_transition",
        return_value="¿Seguimos con el catálogo?",
    )
    def test_interrupt_calls_resume_transition_with_context(
        self,
        mock_transition,
        _mock_fetch,
        _mock_turn,
    ) -> None:
        state: clientState = {
            "messages": [
                {
                    "role": "assistant",
                    "content": "Elige un modelo de la lista.",
                    "type": "AIMessage",
                },
                {"role": "user", "content": "¿dónde están?", "type": "HumanMessage"},
            ],
            "is_faq_interrupt": True,
            "resume_to_step": "car_selection",
            "last_bot_message": "Elige un modelo de la lista.",
            "awaiting_purchase_confirmation": False,
            "awaiting_purchase_preferences": False,
        }
        updated = faq(state)
        mock_transition.assert_called_once_with(
            user_message="¿dónde están?",
            last_bot_message="Elige un modelo de la lista.",
            resume_to_step="car_selection",
            state=state,
        )
        _mock_turn.assert_called_once()
        self.assertEqual(_mock_turn.call_args.kwargs["transition_literal"], "¿Seguimos con el catálogo?")
        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertFalse(updated.get("is_faq_interrupt"))

    @patch("src.nodes.faq.generate_faq_user_turn", return_value="FAQ + contacto")
    @patch("src.nodes.faq.fetch_faq_candidates", return_value=["Ubicación: Centro."])
    @patch("src.nodes.faq.generate_faq_resume_transition")
    def test_interrupt_mid_purchase_uses_contact_literal_without_llm(
        self,
        mock_transition,
        _mock_fetch,
        mock_turn,
    ) -> None:
        state: clientState = {
            "messages": [
                {
                    "role": "assistant",
                    "content": CONTACT_PREFERENCE_MESSAGE,
                    "type": "AIMessage",
                },
                {"role": "user", "content": "¿dónde están?", "type": "HumanMessage"},
            ],
            "is_faq_interrupt": True,
            "resume_to_step": "car_selection",
            "selected_car": "Toyota Corolla",
            "awaiting_purchase_confirmation": True,
            "awaiting_purchase_preferences": False,
        }
        faq(state)
        mock_transition.assert_not_called()
        self.assertEqual(mock_turn.call_args.kwargs["transition_literal"], CONTACT_PREFERENCE_MESSAGE)


if __name__ == "__main__":
    unittest.main()
