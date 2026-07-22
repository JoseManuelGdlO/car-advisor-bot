"""Integracion HTTP /chat: bienvenida + flujo comercial en el mismo turno."""

from __future__ import annotations

import copy
import unittest
from typing import Any
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from src.server import app
from src.utils.state_helpers import clear_onboarding_turn_flags


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


class ClearOnboardingTurnFlagsTests(unittest.TestCase):
    def test_clears_welcome_sent_flag(self) -> None:
        state: dict[str, object] = {
            "onboarding_welcome_sent_this_turn": True,
        }
        clear_onboarding_turn_flags(state)
        self.assertFalse(state["onboarding_welcome_sent_this_turn"])


class TestChatOnboardingSameTurn(unittest.TestCase):
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
    @patch(
        "src.nodes.customer_onboarding.get_bot_settings",
        return_value={"welcomeMessage": "Bienvenido a la agencia.", "botName": "AutoBot"},
    )
    @patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False})
    @patch("src.server.upsert_bot_session_state")
    @patch("src.server.fetch_active_bot_session")
    def test_commercial_intent_continues_after_welcome_same_turn(
        self,
        mock_fetch: MagicMock,
        mock_upsert: MagicMock,
        *_patches: object,
    ) -> None:
        mock_fetch.side_effect = self.session_store.fetch
        mock_upsert.side_effect = self.session_store.upsert

        first = self._chat("hola para preguntar por jimny de 5 puertas")
        self.assertIn("Bienvenido a la agencia.", first["reply"])
        self.assertNotIn("cómo te llamas", first["reply"].lower())
        self.assertNotIn("como te llamas", first["reply"].lower())
        self.assertIsNotNone(self.session_store.state)
        assert self.session_store.state is not None
        self.assertTrue(self.session_store.state.get("onboarding_greeting_done"))
        self.assertEqual(self.session_store.state.get("current_node"), "car_selection")


if __name__ == "__main__":
    unittest.main()
