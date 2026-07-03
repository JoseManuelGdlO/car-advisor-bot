"""Flujo promotions: interés suave en promo con vehículo ya en contexto."""

from __future__ import annotations

from unittest.mock import patch

from src.nodes.promotions import promotions
from tests.test_helpers import GraphTestCase, initial_state, with_user_message

_BALENO_ID = "48acf45e-770b-11f1-bd00-02420a0b0007"
_SWIFT_ID = "525eee39-05b4-4dd3-b8d2-ad3d2a2523b4"
_PROMO_ID = "promo-bono-descuento"

_BALENO = {
    "id": _BALENO_ID,
    "brand": "Suzuki",
    "model": "Baleno",
    "trim": "GLX",
    "year": 2025,
    "status": "available",
    "price": 350000,
}
_SWIFT = {
    "id": _SWIFT_ID,
    "brand": "Suzuki",
    "model": "Swift",
    "trim": "GL",
    "year": 2025,
    "status": "available",
    "price": 320000,
}

_PROMOTION = {
    "id": _PROMO_ID,
    "title": "Bono de Descuento",
    "description": "Hasta $30,000 MXN en modelos participantes",
    "validUntil": "2026-07-31",
    "vehicleIds": [_BALENO_ID, _SWIFT_ID],
    "active": True,
}

_NAV_FLAGS_SOFT_INTEREST_WRONG = {
    "ask_financing": False,
    "ask_other_vehicles": False,
    "ask_promotions": False,
    "wants_compare_two_promotions": False,
    "select_promotion": True,
    "apply_promotion": False,
    "ask_promotion_vehicle_info": True,
    "cancel_promotion_flow": False,
    "confirm_yes": False,
    "confirm_no": False,
}

_NAV_FLAGS_SOFT_INTEREST_CORRECT = {
    **_NAV_FLAGS_SOFT_INTEREST_WRONG,
    "ask_promotion_vehicle_info": False,
}


def _fetch_vehicle_by_id(vehicle_id: str) -> dict | None:
    if vehicle_id == _BALENO_ID:
        return _BALENO
    if vehicle_id == _SWIFT_ID:
        return _SWIFT
    return None


def _base_state() -> dict:
    state = initial_state()
    state["current_node"] = "promotions"
    state["intent"] = "promotions"
    state["awaiting_promotion_selection"] = True
    state["selected_vehicle_id"] = _BALENO_ID
    state["selected_car"] = "Suzuki Baleno GLX 2025"
    state["promotion_candidates"] = [_PROMOTION]
    state["last_bot_message"] = (
        "Actualmente tenemos varias promociones para los modelos Suzuki. "
        "Puedes obtener un Bono de Descuento de hasta $30,000 MXN..."
    )
    state["messages"] = [
        {
            "role": "assistant",
            "content": state["last_bot_message"],
            "type": "AIMessage",
        }
    ]
    return state


def _assistant_texts(state: dict) -> list[str]:
    return [
        str(message.get("content", ""))
        for message in state.get("messages", [])
        if message.get("role") == "assistant"
    ]


class PromotionsContextFlowTests(GraphTestCase):
    def test_soft_promo_interest_skips_vehicle_relist(self) -> None:
        """Guard de código: aunque el LLM marque ask_promotion_vehicle_info, no relista."""
        state = with_user_message(
            _base_state(),
            "se escucha interesante la del bono de descuento",
        )
        with (
            patch(
                "src.nodes.promotions.classify_promotions_step_flags",
                return_value=_NAV_FLAGS_SOFT_INTEREST_WRONG,
            ),
            patch(
                "src.nodes.promotions.classify_promotion_selection_intent",
                return_value="ASK_EXPLICIT_PROMOTION",
            ),
            patch(
                "src.nodes.promotions.fetch_vehicle_by_id",
                side_effect=_fetch_vehicle_by_id,
            ),
            patch(
                "src.nodes.promotions.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
        ):
            updated = promotions(state)

        self.assertTrue(updated.get("awaiting_promotion_apply_confirmation"))
        self.assertFalse(updated.get("awaiting_promotion_vehicle_selection"))
        combined = "\n".join(_assistant_texts(updated)).lower()
        self.assertIn("aplicar", combined)
        self.assertNotIn("cual quieres ver por nombre o numero", combined)
        self.assertNotIn("1. suzuki swift", combined)

    def test_soft_promo_interest_llm_flags(self) -> None:
        """Nav flags correctos del LLM: confirmación sin relistar vehículos."""
        state = with_user_message(
            _base_state(),
            "me interesa la del bono de descuento",
        )
        with (
            patch(
                "src.nodes.promotions.classify_promotions_step_flags",
                return_value=_NAV_FLAGS_SOFT_INTEREST_CORRECT,
            ),
            patch(
                "src.nodes.promotions.classify_promotion_selection_intent",
                return_value="ASK_EXPLICIT_PROMOTION",
            ),
            patch(
                "src.nodes.promotions.fetch_vehicle_by_id",
                side_effect=_fetch_vehicle_by_id,
            ),
            patch(
                "src.nodes.promotions.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
        ):
            updated = promotions(state)

        self.assertTrue(updated.get("awaiting_promotion_apply_confirmation"))
        self.assertFalse(updated.get("awaiting_promotion_vehicle_selection"))
        combined = "\n".join(_assistant_texts(updated)).lower()
        self.assertIn("bono de descuento", combined)
        self.assertNotIn("estos son los vehiculos aplicables", combined)

    def test_soft_promo_interest_integration_single_turn(self) -> None:
        """Integración: un turno con vehículo preseleccionado no relista autos de la promo."""
        state = with_user_message(
            _base_state(),
            "se escucha interesante la del bono de descuento",
        )
        with (
            patch(
                "src.nodes.intent_checker.classify_faq_interrupt_flags",
                return_value={"interrumpir_por_faq": False},
            ),
            patch(
                "src.nodes.promotions.classify_promotions_step_flags",
                return_value=_NAV_FLAGS_SOFT_INTEREST_CORRECT,
            ),
            patch(
                "src.nodes.promotions.classify_promotion_selection_intent",
                return_value="ASK_EXPLICIT_PROMOTION",
            ),
            patch(
                "src.nodes.promotions.fetch_vehicle_by_id",
                side_effect=_fetch_vehicle_by_id,
            ),
            patch(
                "src.nodes.promotions.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertTrue(updated.get("awaiting_promotion_apply_confirmation"))
        self.assertFalse(updated.get("awaiting_promotion_vehicle_selection"))
        combined = "\n".join(_assistant_texts(updated)).lower()
        self.assertIn("aplicar", combined)
        self.assertNotIn("1. suzuki swift gl 2025", combined)


if __name__ == "__main__":
    import unittest

    unittest.main()
