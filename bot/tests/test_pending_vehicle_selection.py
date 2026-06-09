from __future__ import annotations

import unittest
from unittest.mock import patch

from src.nodes.car_selection import (
    _find_candidate_from_pending,
    _resolve_pending_vehicle_from_extract,
    _respond_pending_selection_clarification,
)
from tests.test_helpers import initial_state, with_user_message


def _mazda_candidates() -> list[dict]:
    return [
        {
            "id": "veh-mazda3",
            "brand": "Mazda",
            "model": "Mazda 3 i Touring",
            "year": 2022,
            "status": "available",
        },
        {
            "id": "veh-cx5",
            "brand": "Mazda",
            "model": "CX-5 Grand Touring",
            "year": 2021,
            "status": "available",
        },
    ]


def _state_with_pending(candidates: list[dict] | None = None) -> dict:
    state = initial_state()
    state["last_vehicle_candidates"] = candidates if candidates is not None else _mazda_candidates()
    state["last_bot_message"] = (
        "1. Mazda Mazda 3 i Touring 2022\n"
        "2. Mazda CX-5 Grand Touring 2021\n\n"
        "Dime el nombre o numero del modelo que te interese."
    )
    return state


class ResolvePendingVehicleFromExtractTests(unittest.TestCase):
    def test_resolves_by_name_query_single_match(self) -> None:
        pending = _mazda_candidates()
        options = ["Mazda Mazda 3 i Touring 2022", "Mazda CX-5 Grand Touring 2021"]
        payload = {"vehicle_index": None, "name_query": "3", "no_match": False}

        result = _resolve_pending_vehicle_from_extract(pending, options, payload)

        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("id"), "veh-mazda3")

    def test_resolves_by_valid_index(self) -> None:
        pending = _mazda_candidates()
        options = ["Mazda Mazda 3 i Touring 2022", "Mazda CX-5 Grand Touring 2021"]
        payload = {"vehicle_index": 2, "name_query": "", "no_match": False}

        result = _resolve_pending_vehicle_from_extract(pending, options, payload)

        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("id"), "veh-cx5")

    def test_invalid_index_without_name_query_returns_none(self) -> None:
        pending = _mazda_candidates()
        options = ["Mazda Mazda 3 i Touring 2022", "Mazda CX-5 Grand Touring 2021"]
        payload = {"vehicle_index": 3, "name_query": "", "no_match": False}

        result = _resolve_pending_vehicle_from_extract(pending, options, payload)

        self.assertIsNone(result)

    def test_no_match_flag_returns_none(self) -> None:
        pending = _mazda_candidates()
        options = ["Mazda Mazda 3 i Touring 2022", "Mazda CX-5 Grand Touring 2021"]
        payload = {"vehicle_index": None, "name_query": "", "no_match": True}

        result = _resolve_pending_vehicle_from_extract(pending, options, payload)

        self.assertIsNone(result)

    def test_ambiguous_name_query_returns_list(self) -> None:
        pending = [
            {
                "id": "veh-cx5-a",
                "brand": "Mazda",
                "model": "CX-5 Sport",
                "year": 2020,
                "status": "available",
            },
            {
                "id": "veh-cx5-b",
                "brand": "Mazda",
                "model": "CX-5 Grand Touring",
                "year": 2021,
                "status": "available",
            },
        ]
        options = ["Mazda CX-5 Sport 2020", "Mazda CX-5 Grand Touring 2021"]
        payload = {"vehicle_index": None, "name_query": "cx-5", "no_match": False}

        result = _resolve_pending_vehicle_from_extract(pending, options, payload)

        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 2)


class FindCandidateFromPendingTests(unittest.TestCase):
    def test_selects_by_explicit_index_without_llm(self) -> None:
        state = _state_with_pending()

        with patch("src.nodes.car_selection.extract_vehicle_pending_selection_payload") as mocked_llm:
            result = _find_candidate_from_pending(state, "1")

        mocked_llm.assert_not_called()
        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("id"), "veh-mazda3")

    def test_llm_resolves_el_3_esta_bien(self) -> None:
        state = _state_with_pending()
        llm_payload = {"vehicle_index": None, "name_query": "3", "no_match": False}

        with patch(
            "src.nodes.car_selection.extract_vehicle_pending_selection_payload",
            return_value=llm_payload,
        ):
            result = _find_candidate_from_pending(state, "El 3 esta bien")

        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("id"), "veh-mazda3")

    def test_out_of_range_index_with_llm_no_match_returns_none(self) -> None:
        state = _state_with_pending()
        llm_payload = {"vehicle_index": None, "name_query": "", "no_match": True}

        with patch(
            "src.nodes.car_selection.extract_vehicle_pending_selection_payload",
            return_value=llm_payload,
        ):
            result = _find_candidate_from_pending(state, "3")

        self.assertIsNone(result)

    def test_llm_no_match_on_greeting_returns_none(self) -> None:
        state = _state_with_pending()
        llm_payload = {"vehicle_index": None, "name_query": "", "no_match": True}

        with patch(
            "src.nodes.car_selection.extract_vehicle_pending_selection_payload",
            return_value=llm_payload,
        ):
            result = _find_candidate_from_pending(state, "hola")

        self.assertIsNone(result)

    def test_llm_ambiguous_returns_list(self) -> None:
        pending = [
            {
                "id": "veh-cx5-a",
                "brand": "Mazda",
                "model": "CX-5 Sport",
                "year": 2020,
                "status": "available",
            },
            {
                "id": "veh-cx5-b",
                "brand": "Mazda",
                "model": "CX-5 Grand Touring",
                "year": 2021,
                "status": "available",
            },
        ]
        state = _state_with_pending(pending)
        llm_payload = {"vehicle_index": None, "name_query": "cx-5", "no_match": False}

        with patch(
            "src.nodes.car_selection.extract_vehicle_pending_selection_payload",
            return_value=llm_payload,
        ):
            result = _find_candidate_from_pending(state, "el cx-5")

        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 2)


class PendingSelectionClarificationTests(unittest.TestCase):
    def test_clarification_updates_pending_subset(self) -> None:
        ambiguous = _mazda_candidates()
        state = with_user_message(_state_with_pending(), "el mazda")

        with patch(
            "src.nodes.car_selection.generate_vehicle_candidates_selection_message",
            return_value="¿Cual prefieres?\n1. Mazda 3\n2. CX-5",
        ):
            updated = _respond_pending_selection_clarification(state, ambiguous)

        self.assertEqual(len(updated.get("last_vehicle_candidates", [])), 2)
        messages = updated.get("messages", [])
        self.assertTrue(messages)
        self.assertEqual(messages[-1].get("role"), "assistant")
        self.assertIn("Cual prefieres", str(messages[-1].get("content", "")))


if __name__ == "__main__":
    unittest.main()
