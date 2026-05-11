"""Resolucion de promocion por solapamiento de tokens y extractor JSON."""

from __future__ import annotations

import unittest

from src.nodes.promotions import _pick_promotion_by_token_overlap, _resolve_promotion_from_extract


class TestPromotionPickResolution(unittest.TestCase):
    def test_token_overlap_partial_title(self) -> None:
        candidates = [
            {"id": "a", "title": "Diciembre de regalo!!", "active": True},
            {"id": "b", "title": "Mensualidad gratis en SUVs", "active": True},
            {"id": "c", "title": "Bono de descuento de mayo", "active": True},
        ]
        picked = _pick_promotion_by_token_overlap(candidates, "me interesa la mensualidad gratis")
        self.assertIsNotNone(picked)
        assert picked is not None
        self.assertEqual(picked.get("title"), "Mensualidad gratis en SUVs")

    def test_resolve_from_extract_index(self) -> None:
        candidates = [
            {"id": "1", "title": "Uno"},
            {"id": "2", "title": "Dos"},
        ]
        self.assertEqual(
            _resolve_promotion_from_extract(
                candidates,
                {"no_match": False, "promotion_index": 2, "title_query": ""},
            ),
            candidates[1],
        )

    def test_resolve_from_extract_title_query(self) -> None:
        candidates = [
            {"id": "1", "title": "Mensualidad gratis en SUVs"},
            {"id": "2", "title": "Bono de descuento de mayo"},
        ]
        r = _resolve_promotion_from_extract(
            candidates,
            {"no_match": False, "promotion_index": None, "title_query": "bono mayo"},
        )
        self.assertIsNotNone(r)
        assert r is not None
        self.assertIn("mayo", r.get("title", "").lower())

    def test_no_match_skips(self) -> None:
        candidates = [{"id": "1", "title": "Solo una"}]
        self.assertIsNone(
            _resolve_promotion_from_extract(candidates, {"no_match": True, "promotion_index": 1, "title_query": ""}),
        )


if __name__ == "__main__":
    unittest.main()
