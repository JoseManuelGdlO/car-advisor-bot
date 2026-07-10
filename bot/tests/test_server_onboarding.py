"""Integracion HTTP /chat: onboarding en dos turnos con intencion comercial pendiente."""

from __future__ import annotations

import copy
import unittest
from typing import Any
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from src.server import app
from src.utils.state_helpers import clear_onboarding_resume


class _InMemorySessionStore:
    def __init__(self) -> None:
        self.state: dict[str, Any] | None = None
        self.conversation_id: str | None = None

    def fetch(self, _phone: str, _platform: str) -> tuple[dict[str, Any] | None, str | None]:
        if self.state is None:
            return None, None
        return copy.deepcopy(self.state), self.conversation_id

    def upsert(
        self,
        _phone: str,
        state_dict: dict[str, Any],
        platform: str = "web",
        conversation_id: str | None = None,
        **_kwargs: object,
    ) -> None:
        self.state = copy.deepcopy(state_dict)
        if conversation_id:
            self.conversation_id = conversation_id


class ClearOnboardingResumeTests(unittest.TestCase):
    def test_preserves_pending_message_across_turns(self) -> None:
        state: dict[str, str] = {
            "onboarding_resume_user_message": "quiero ver el jimny",
            "pending_onboarding_user_message": "hola quiero ver el jimny",
        }
        clear_onboarding_resume(state)
        self.assertEqual(state["onboarding_resume_user_message"], "")
        self.assertEqual(state["pending_onboarding_user_message"], "hola quiero ver el jimny")


class TestChatOnboardingTwoTurns(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self.session_store = _InMemorySessionStore()

    def _chat(self, message: str) -> dict[str, Any]:
        response = self.client.post(
            "/chat",
            json={
                "user_id": "6185555454",
                "message": message,
                "platform": "web",
                "persist_to_backend": False,
            },
        )
        self.assertEqual(response.status_code, 200)
        return response.json()

    @patch("src.nodes.car_selection.fetch_vehicles", return_value=[])
    @patch(
        "src.nodes.car_selection.generate_verified_user_message",
        side_effect=lambda **kw: kw.get("fallback", ""),
    )
    @patch("src.nodes.router.classify_router_intent", return_value="VEHICLE_CATALOG")
    @patch("src.nodes.customer_onboarding.sync_customer_info_to_backend")
    @patch(
        "src.nodes.customer_onboarding.extract_customer_name",
        return_value={"nombre": "Javier", "is_refusal": False, "mensaje_restante": ""},
    )
    @patch(
        "src.nodes.customer_onboarding.generate_welcome_and_name_request",
        return_value="¡Hola! ¿Cómo te llamas?",
    )
    @patch(
        "src.nodes.customer_onboarding.classify_onboarding_first_message",
        return_value={"tiene_intencion_comercial": True},
    )
    @patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False})
    @patch("src.server.upsert_bot_session_state")
    @patch("src.server.fetch_active_bot_session")
    def test_commercial_intent_then_name_resumes_vehicle_flow(
        self,
        mock_fetch: MagicMock,
        mock_upsert: MagicMock,
        *_patches: object,
    ) -> None:
        mock_fetch.side_effect = self.session_store.fetch
        mock_upsert.side_effect = self.session_store.upsert

        first = self._chat("hola para preguntar por jimny de 5 puertas")
        self.assertIn("¿Cómo te llamas?", first["reply"])
        self.assertIsNotNone(self.session_store.state)
        assert self.session_store.state is not None
        self.assertEqual(
            self.session_store.state.get("pending_onboarding_user_message"),
            "hola para preguntar por jimny de 5 puertas",
        )
        self.assertTrue(self.session_store.state.get("awaiting_customer_name"))
        self.assertEqual(self.session_store.state.get("onboarding_resume_user_message"), "")

        second = self._chat("Con javier")
        self.assertIn("Mucho gusto, Javier", second["reply"])
        assert self.session_store.state is not None
        self.assertEqual(self.session_store.state.get("pending_onboarding_user_message"), "")
        self.assertEqual(self.session_store.state.get("onboarding_resume_user_message"), "")
        self.assertEqual(self.session_store.state.get("current_node"), "car_selection")
        self.assertEqual(self.session_store.state.get("customer_info", {}).get("nombre"), "Javier")


if __name__ == "__main__":
    unittest.main()
