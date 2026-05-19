from __future__ import annotations

import unittest

from src.context.tenant_context import (
    get_owner_user_id,
    reset_owner_user_id,
    set_owner_user_id,
)


class TestTenantContext(unittest.TestCase):
    def tearDown(self) -> None:
        reset_owner_user_id(None)

    def test_set_and_get_owner(self) -> None:
        token = set_owner_user_id("550e8400-e29b-41d4-a716-446655440001")
        self.assertEqual(get_owner_user_id(), "550e8400-e29b-41d4-a716-446655440001")
        reset_owner_user_id(token)
        self.assertEqual(get_owner_user_id(), "")
