"""Desactivacion del bot tras handoff."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from src.utils.bot_control import deactivate_bot
from tests.test_helpers import initial_state, with_user_message


class TestDeactivateBot(unittest.TestCase):
    def test_sets_bot_disabled_flag(self) -> None:
        state = with_user_message(initial_state(), "Hola")
        with patch("src.utils.bot_control.set_conversation_human_controlled", return_value=True):
            out = deactivate_bot(dict(state), reason="test")
        self.assertTrue(out.get("bot_disabled"))

    def test_calls_crm_handoff_when_conversation_id_present(self) -> None:
        state = with_user_message(initial_state(), "Hola")
        state["conversation_id"] = "conv-uuid-1"
        with patch("src.utils.bot_control.set_conversation_human_controlled") as mock_ctrl:
            mock_ctrl.return_value = True
            deactivate_bot(dict(state), reason="lead_capture")
        mock_ctrl.assert_called_once_with("conv-uuid-1", is_human_controlled=True)

    def test_skips_crm_when_no_conversation_id(self) -> None:
        state = with_user_message(initial_state(), "Hola")
        with patch("src.utils.bot_control.set_conversation_human_controlled") as mock_ctrl:
            deactivate_bot(dict(state), reason="handoff")
        mock_ctrl.assert_not_called()
