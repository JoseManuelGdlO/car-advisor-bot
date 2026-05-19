from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

from src.context.tenant_context import reset_owner_user_id, set_owner_user_id
from src.tools.database import clear_bot_settings_cache, get_bot_settings

OWNER_TEST = "550e8400-e29b-41d4-a716-446655440099"


class TestBotSettingsCache(unittest.TestCase):
    _owner_token = None

    def tearDown(self) -> None:
        clear_bot_settings_cache()
        if self._owner_token is not None:
            reset_owner_user_id(self._owner_token)
            self._owner_token = None

    def _bind_owner(self, owner_id: str = OWNER_TEST) -> None:
        if self._owner_token is not None:
            reset_owner_user_id(self._owner_token)
        self._owner_token = set_owner_user_id(owner_id)

    @patch.dict(
        os.environ,
        {
            "BACKEND_API_URL": "http://cache-test.example",
            "BACKEND_SERVICE_TOKEN": "test-token",
            "BOT_SETTINGS_CACHE_TTL_SECONDS": "60",
        },
        clear=False,
    )
    @patch("src.tools.database.time.monotonic", side_effect=[10.0, 10.0])
    @patch("src.tools.database.requests.get")
    def test_second_call_within_ttl_skips_http(
        self, mock_get: MagicMock, _mock_mono: MagicMock
    ) -> None:
        clear_bot_settings_cache()
        self._bind_owner()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "tone": "formal",
            "emojiStyle": "pocos",
            "salesProactivity": "bajo",
            "customInstructions": "Instrucciones de prueba",
        }
        mock_get.return_value = mock_resp

        first = get_bot_settings()
        second = get_bot_settings()

        self.assertEqual(mock_get.call_count, 1)
        mock_get.assert_called_with(
            unittest.mock.ANY,
            headers=unittest.mock.ANY,
            params={"ownerUserId": OWNER_TEST},
            timeout=6,
        )
        self.assertEqual(first, second)
        self.assertEqual(first["tone"], "formal")

    @patch.dict(
        os.environ,
        {
            "BACKEND_API_URL": "http://cache-test.example",
            "BACKEND_SERVICE_TOKEN": "test-token",
            "BOT_SETTINGS_CACHE_TTL_SECONDS": "60",
        },
        clear=False,
    )
    @patch("src.tools.database.time.monotonic", side_effect=[10.0, 80.0, 80.0])
    @patch("src.tools.database.requests.get")
    def test_http_after_ttl_expires(
        self, mock_get: MagicMock, _mock_mono: MagicMock
    ) -> None:
        clear_bot_settings_cache()
        self._bind_owner()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "tone": "cercano",
            "emojiStyle": "frecuentes",
            "salesProactivity": "alto",
            "customInstructions": "Uno",
        }
        mock_get.return_value = mock_resp

        get_bot_settings()
        get_bot_settings()

        self.assertEqual(mock_get.call_count, 2)

    @patch.dict(
        os.environ,
        {
            "BACKEND_API_URL": "http://cache-test.example",
            "BACKEND_SERVICE_TOKEN": "test-token",
            "BOT_SETTINGS_CACHE_TTL_SECONDS": "0",
        },
        clear=False,
    )
    @patch("src.tools.database.requests.get")
    def test_ttl_zero_never_caches(self, mock_get: MagicMock) -> None:
        clear_bot_settings_cache()
        self._bind_owner()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "tone": "cercano",
            "emojiStyle": "frecuentes",
            "salesProactivity": "alto",
            "customInstructions": "x",
        }
        mock_get.return_value = mock_resp

        get_bot_settings()
        get_bot_settings()

        self.assertEqual(mock_get.call_count, 2)

    @patch.dict(
        os.environ,
        {
            "BACKEND_API_URL": "http://cache-test.example",
            "BACKEND_SERVICE_TOKEN": "test-token",
            "BOT_SETTINGS_CACHE_TTL_SECONDS": "60",
        },
        clear=False,
    )
    @patch("src.tools.database.time.monotonic", return_value=0.0)
    @patch("src.tools.database.requests.get")
    def test_failed_fetch_does_not_fill_cache(self, mock_get: MagicMock, _mock_mono: MagicMock) -> None:
        clear_bot_settings_cache()
        self._bind_owner()
        mock_get.return_value = MagicMock(status_code=503)

        get_bot_settings()
        get_bot_settings()

        self.assertEqual(mock_get.call_count, 2)

    @patch.dict(
        os.environ,
        {
            "BACKEND_API_URL": "http://cache-test.example",
            "BACKEND_SERVICE_TOKEN": "test-token",
            "BOT_SETTINGS_CACHE_TTL_SECONDS": "60",
        },
        clear=False,
    )
    @patch("src.tools.database.time.monotonic", return_value=1.0)
    @patch("src.tools.database.requests.get")
    def test_returns_shallow_copy_from_cache(
        self, mock_get: MagicMock, _mock_mono: MagicMock
    ) -> None:
        clear_bot_settings_cache()
        self._bind_owner()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "tone": "formal",
            "emojiStyle": "frecuentes",
            "salesProactivity": "alto",
            "customInstructions": "Original",
        }
        mock_get.return_value = mock_resp

        first = get_bot_settings()
        first["tone"] = "mutado"
        second = get_bot_settings()

        self.assertEqual(mock_get.call_count, 1)
        self.assertEqual(second["tone"], "formal")

    @patch.dict(
        os.environ,
        {
            "BACKEND_API_URL": "http://cache-test.example",
            "BACKEND_SERVICE_TOKEN": "test-token",
            "BOT_SETTINGS_CACHE_TTL_SECONDS": "60",
        },
        clear=False,
    )
    @patch("src.tools.database.time.monotonic", return_value=5.0)
    @patch("src.tools.database.requests.get")
    def test_cache_isolated_per_owner(self, mock_get: MagicMock, _mock_mono: MagicMock) -> None:
        clear_bot_settings_cache()
        owner_b = "550e8400-e29b-41d4-a716-446655440088"
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "tone": "formal",
            "emojiStyle": "pocos",
            "salesProactivity": "bajo",
            "customInstructions": "A",
        }
        mock_get.return_value = mock_resp

        self._bind_owner(OWNER_TEST)
        get_bot_settings()
        reset_owner_user_id(self._owner_token)
        self._owner_token = set_owner_user_id(owner_b)
        get_bot_settings()

        self.assertEqual(mock_get.call_count, 2)
