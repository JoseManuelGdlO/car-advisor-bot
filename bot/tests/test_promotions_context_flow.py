"""Flujo promotions informativo (estilo FAQ): listar promo + follow-up segun paso."""

from __future__ import annotations

from unittest.mock import patch

from src.utils.purchase_flow_messages import (
    CONTACT_PREFERENCE_MESSAGE,
    FAQ_SOFT_CATALOG_CLOSE,
)
from tests.test_helpers import GraphTestCase, initial_state, with_user_message

_PROMO = {
    "id": "promo-bono",
    "title": "Bono de Descuento",
    "description": "Hasta $30,000 MXN",
    "validUntil": "2026-07-31",
    "vehicleIds": ["veh-1"],
    "active": True,
}


class PromotionsContextFlowTests(GraphTestCase):
    def test_with_vehicle_shows_promo_and_contact_follow_up(self) -> None:
        state = initial_state()
        state["user_id"] = "5512345678"
        state["current_node"] = "promotions"
        state["intent"] = "promotions"
        state["selected_vehicle_id"] = "veh-1"
        state["selected_car"] = "Suzuki Baleno 2025"
        state = with_user_message(state, "que promociones tienen?")

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.promotions.fetch_promotions_by_vehicle", return_value=[_PROMO]),
            patch("src.nodes.promotions.persist_commercial_selection_to_backend") as persist_mock,
        ):
            updated = self.graph.invoke(state)

        reply = str(updated["messages"][-1]["content"])
        self.assertIn("Bono de Descuento", reply)
        self.assertIn(CONTACT_PREFERENCE_MESSAGE, reply)
        self.assertTrue(updated.get("awaiting_purchase_confirmation"))
        self.assertEqual(updated.get("selected_promotion_id"), "promo-bono")
        self.assertEqual(updated.get("selected_promotion_title"), "Bono de Descuento")
        self.assertFalse(updated.get("awaiting_promotion_selection"))
        persist_mock.assert_called_once()
        self.assertEqual(
            persist_mock.call_args.kwargs["promotion_selection"]["title"],
            "Bono de Descuento",
        )

    def test_without_vehicle_shows_promo_and_soft_catalog(self) -> None:
        state = initial_state()
        state["user_id"] = "5512345678"
        state["current_node"] = "promotions"
        state["intent"] = "promotions"
        state = with_user_message(state, "hay promociones?")

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.promotions.fetch_promotions", return_value=[_PROMO]),
            patch("src.nodes.promotions.persist_commercial_selection_to_backend"),
        ):
            updated = self.graph.invoke(state)

        reply = str(updated["messages"][-1]["content"])
        self.assertIn("Bono de Descuento", reply)
        self.assertIn(FAQ_SOFT_CATALOG_CLOSE, reply)
        self.assertNotIn(CONTACT_PREFERENCE_MESSAGE, reply)

    def test_financing_request_hops_to_financing(self) -> None:
        state = initial_state()
        state["current_node"] = "promotions"
        state["intent"] = "promotions"
        state = with_user_message(state, "y el financiamiento?")

        plan = {
            "id": "plan-1",
            "name": "Plan Unico",
            "lender": "BBVA",
            "active": True,
            "vehicles": [{"id": "v1", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"}],
            "rate": 1.0,
            "showRate": True,
            "maxTermMonths": 12,
        }
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.intent_checker.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.financing.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.financing.fetch_financing_plans", return_value=[plan]),
            patch("src.nodes.financing.persist_commercial_selection_to_backend"),
        ):
            updated = self.graph.invoke(state)

        reply = str(updated["messages"][-1]["content"])
        self.assertIn("Plan Unico", reply)
        self.assertIn(FAQ_SOFT_CATALOG_CLOSE, reply)
