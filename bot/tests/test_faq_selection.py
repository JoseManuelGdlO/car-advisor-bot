from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from src.services.llm_responses import (
    _format_faq_catalog_for_selection,
    _parse_faq_selection_indices,
    select_faq_candidates_with_llm,
)
from src.tools.database import faq_entry_to_candidate, fetch_faq_candidates


class FaqSelectionHelpersTests(unittest.TestCase):
    def test_faq_entry_to_candidate_formats_question_and_answer(self) -> None:
        out = faq_entry_to_candidate({"question": "Horario?", "answer": "9 a 6"})
        self.assertEqual(out, "P: Horario?\nR: 9 a 6")

    def test_format_faq_catalog_uses_one_based_indices(self) -> None:
        catalog = _format_faq_catalog_for_selection(
            [
                {"question": "Horario?", "answer": "9 a 6"},
                {"question": "Ubicacion?", "answer": "Centro"},
            ]
        )
        self.assertIn("FAQ #1", catalog)
        self.assertIn("FAQ #2", catalog)

    def test_parse_faq_selection_indices_filters_invalid(self) -> None:
        indices = _parse_faq_selection_indices(
            {"indices": [2, 99, 1, 1], "sin_match": False},
            catalog_size=3,
        )
        self.assertEqual(indices, [2, 1])

    def test_parse_faq_selection_indices_honors_sin_match(self) -> None:
        indices = _parse_faq_selection_indices(
            {"indices": [1], "sin_match": True},
            catalog_size=3,
        )
        self.assertEqual(indices, [])


class SelectFaqCandidatesWithLlmTests(unittest.TestCase):
    @patch("src.services.llm_responses.ChatOpenAI")
    @patch("src.services.llm_responses.get_bot_settings", return_value={})
    def test_select_faq_candidates_returns_matching_entries(
        self,
        _mock_settings: object,
        mock_chat_openai: MagicMock,
    ) -> None:
        mock_chat_openai.return_value.invoke.return_value = MagicMock(
            content='{"indices": [2], "sin_match": false}'
        )
        entries = [
            {"question": "Buró?", "answer": "Sí revisamos."},
            {"question": "Qué horario tienen?", "answer": "Lun-vie 9-7"},
        ]
        result = select_faq_candidates_with_llm("que horarios manejan?", entries)
        self.assertEqual(result, ["P: Qué horario tienen?\nR: Lun-vie 9-7"])

    @patch("src.services.llm_responses.ChatOpenAI")
    @patch("src.services.llm_responses.get_bot_settings", return_value={})
    def test_select_faq_candidates_empty_when_sin_match(
        self,
        _mock_settings: object,
        mock_chat_openai: MagicMock,
    ) -> None:
        mock_chat_openai.return_value.invoke.return_value = MagicMock(
            content='{"indices": [], "sin_match": true}'
        )
        entries = [{"question": "Horario?", "answer": "9 a 6"}]
        result = select_faq_candidates_with_llm("quiero un suv", entries)
        self.assertEqual(result, [])


class FetchFaqCandidatesIntegrationTests(unittest.TestCase):
    @patch("src.services.llm_responses.select_faq_candidates_with_llm")
    @patch("src.tools.database.fetch_all_faqs_for_owner")
    def test_fetch_faq_candidates_delegates_to_llm_selector(
        self,
        mock_fetch_all: MagicMock,
        mock_select: MagicMock,
    ) -> None:
        mock_fetch_all.return_value = [
            {"id": "1", "question": "Horario?", "answer": "9 a 6"},
        ]
        mock_select.return_value = ["P: Horario?\nR: 9 a 6"]
        result = fetch_faq_candidates("que horarios manejan?")
        mock_fetch_all.assert_called_once()
        mock_select.assert_called_once_with(
            "que horarios manejan?",
            mock_fetch_all.return_value,
            max_candidates=12,
        )
        self.assertEqual(result, ["P: Horario?\nR: 9 a 6"])


if __name__ == "__main__":
    unittest.main()
