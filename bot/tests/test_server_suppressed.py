"""Supresion de respuesta cuando bot_disabled o should_auto_reply es false."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from src.server import app


class TestChatSuppressed(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    @patch("src.server.graph")
    @patch("src.server.upsert_bot_session_state")
    @patch("src.server.upsert_inbound_user_message")
    @patch("src.server.fetch_active_bot_session")
    def test_bot_disabled_skips_graph_without_persist(
        self,
        mock_fetch: MagicMock,
        mock_upsert_inbound: MagicMock,
        mock_upsert_session: MagicMock,
        mock_graph: MagicMock,
    ) -> None:
        mock_fetch.return_value = ({"bot_disabled": True, "current_node": "lead_capture"}, "conv-1")
        response = self.client.post(
            "/chat",
            json={
                "user_id": "5215512345678",
                "message": "Hola",
                "platform": "whatsapp",
                "persist_to_backend": False,
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body.get("bot_suppressed"))
        self.assertEqual(body.get("reply"), "")
        mock_upsert_inbound.assert_not_called()
        mock_upsert_session.assert_not_called()
        mock_graph.invoke.assert_not_called()

    @patch("src.server.graph")
    @patch("src.server.upsert_bot_session_state")
    @patch("src.server.upsert_inbound_user_message")
    @patch("src.server.fetch_active_bot_session")
    def test_should_auto_reply_false_skips_graph(
        self,
        mock_fetch: MagicMock,
        mock_upsert_inbound: MagicMock,
        mock_upsert_session: MagicMock,
        mock_graph: MagicMock,
    ) -> None:
        mock_fetch.return_value = ({"bot_disabled": False, "current_node": "start"}, "conv-1")
        mock_upsert_inbound.return_value = {
            "conversation_id": "conv-1",
            "owner_user_id": "owner-1",
            "should_auto_reply": False,
        }
        response = self.client.post(
            "/chat",
            json={
                "user_id": "5215512345678",
                "message": "Hola",
                "platform": "web",
                "persist_to_backend": True,
                "owner_user_id": "owner-1",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json().get("bot_suppressed"))
        mock_graph.invoke.assert_not_called()
