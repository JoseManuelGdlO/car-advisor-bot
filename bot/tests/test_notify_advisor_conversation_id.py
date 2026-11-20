"""Contrato bot -> backend: toda escalacion envia conversationId/channelUserId para ubicar el lead."""

import unittest
from unittest.mock import MagicMock, patch

from src.nodes.lead_capture import _notify_and_persist
from src.tools.vehicles import notify_advisor
from src.utils.human_advisor_notify import handle_human_advisor_request
from tests.test_helpers import initial_state

CONV = "11111111-1111-4111-8111-111111111111"


class TestNotifyAdvisorPayload(unittest.TestCase):
    def test_payload_includes_conversation_and_channel_user_id(self) -> None:
        with patch("src.tools.vehicles.requests.post") as post:
            post.return_value.raise_for_status = MagicMock()
            ok = notify_advisor(
                "Mazda 3",
                {},
                owner_user_id="owner-uuid",
                conversation_id=CONV,
                channel_user_id="5215512345678",
            )
        self.assertTrue(ok)
        data = post.call_args.kwargs["json"]["data"]
        self.assertEqual(data["conversationId"], CONV)
        self.assertEqual(data["channelUserId"], "5215512345678")

    def test_payload_omits_ids_when_missing(self) -> None:
        with patch("src.tools.vehicles.requests.post") as post:
            post.return_value.raise_for_status = MagicMock()
            notify_advisor("Mazda 3", {}, owner_user_id="owner-uuid")
        data = post.call_args.kwargs["json"]["data"]
        self.assertNotIn("conversationId", data)
        self.assertNotIn("channelUserId", data)


class TestEscalationCallersPassIds(unittest.TestCase):
    def _state(self) -> dict:
        state = initial_state()
        state["user_id"] = "5215512345678"
        state["platform"] = "whatsapp"
        state["owner_user_id"] = "owner-uuid"
        state["conversation_id"] = CONV
        state["selected_car"] = "Mazda 3"
        return state

    def test_lead_interest_passes_conversation_id(self) -> None:
        state = self._state()
        with (
            patch("src.nodes.lead_capture.push_event_to_backend"),
            patch("src.nodes.lead_capture.notify_advisor", return_value=True) as notify,
        ):
            _notify_and_persist(
                state,
                selected_car="Mazda 3",
                platform="whatsapp",
                user_id=state["user_id"],
                owner_user_id="owner-uuid",
                contact_method="appointment",
            )
        kwargs = notify.call_args.kwargs
        self.assertEqual(kwargs["conversation_id"], CONV)
        self.assertEqual(kwargs["channel_user_id"], "5215512345678")

    def test_human_advisor_passes_conversation_id(self) -> None:
        state = self._state()
        with (
            patch("src.utils.human_advisor_notify.push_event_to_backend"),
            patch("src.utils.human_advisor_notify.notify_advisor", return_value=True) as notify,
            patch(
                "src.utils.human_advisor_notify.deactivate_bot",
                side_effect=lambda s, **_: {**s, "bot_disabled": True},
            ),
            patch("src.utils.financing_advisor_notify.get_bot_settings", return_value={}),
        ):
            handle_human_advisor_request(dict(state))
        kwargs = notify.call_args.kwargs
        self.assertEqual(kwargs["notification_kind"], "human_advisor")
        self.assertEqual(kwargs["conversation_id"], CONV)
        self.assertEqual(kwargs["channel_user_id"], "5215512345678")


if __name__ == "__main__":
    unittest.main()
