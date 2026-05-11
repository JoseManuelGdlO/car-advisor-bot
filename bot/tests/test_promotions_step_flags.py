from __future__ import annotations

import unittest

from src.services import llm_responses as lr


class _DummyLLM:
    """LLM dummy para pruebas del clasificador de flags de promociones."""

    def __init__(self, *args, **kwargs) -> None:  # type: ignore[no-untyped-def]
        pass

    def invoke(self, prompt: str):  # type: ignore[no-untyped-def]
        # Simple heuristica basada en el propio prompt de prueba; en un entorno real
        # esto vendria del modelo remoto, pero aqui queremos un JSON determinista.
        text = prompt.lower()
        # Solo la linea del usuario: el prompt incluye reglas con "aplicar"/"promocion"
        # y haria match en todo el texto.
        user_part = text
        marker = "mensaje del usuario:"
        if marker in text:
            tail = text.split(marker, 1)[1].strip()
            user_part = tail.split("\n", 1)[0] if tail else ""

        apply_promotion = (
            "aplicar" in user_part
            or "quiero la promocion" in user_part
            or "aplicame" in user_part
        )
        payload: dict[str, bool] = {
            "ask_financing": "financ" in user_part or "mensualidad" in user_part,
            "ask_other_vehicles": "otros carros" in user_part or "otros vehiculos" in user_part,
            "ask_promotions": "promocion" in user_part or "promos" in user_part or "promociones" in user_part,
            "wants_compare_two_promotions": "compara" in user_part,
            "select_promotion": "promo" in user_part or "promocion" in user_part,
            "apply_promotion": apply_promotion,
            "ask_promotion_vehicle_info": "carros que aplican" in user_part
            or "vehiculos que aplican" in user_part
            or "carros que aplican a esa promo" in user_part,
            "cancel_promotion_flow": "olvida las promociones" in user_part or "ya no quiero ver promos" in user_part,
            "confirm_yes": "si" in user_part,
            "confirm_no": "no" in user_part and "si no" not in user_part,
        }

        class _Resp:
            def __init__(self, content: str) -> None:
                self.content = content

        # Import aqui para evitar dependencia circular en import del modulo principal.
        import json as _json

        return _Resp(_json.dumps(payload))


class TestClassifyPromotionsStepFlags(unittest.TestCase):
    def setUp(self) -> None:
        # Parchea ChatOpenAI en el modulo real para que use el dummy durante estas pruebas.
        self._orig_llm = lr.ChatOpenAI
        lr.ChatOpenAI = _DummyLLM  # type: ignore[assignment]

    def tearDown(self) -> None:
        lr.ChatOpenAI = self._orig_llm  # type: ignore[assignment]

    def test_apply_promotion_flag(self) -> None:
        flags = lr.classify_promotions_step_flags(
            previous_bot_message="Te mostre varias promociones.",
            user_message="Quiero aplicar la promocion mensualidad gratis en SUVs",
            current_promotion_title="Mensualidad gratis en SUVs",
            numbered_promotion_lines="1. Mensualidad gratis en SUVs\n2. Bono en efectivo",
        )
        self.assertTrue(flags["apply_promotion"])
        self.assertTrue(flags["select_promotion"])

    def test_ask_promotion_vehicle_info_flag(self) -> None:
        flags = lr.classify_promotions_step_flags(
            previous_bot_message="Esta promocion aplica a varios vehiculos.",
            user_message="Solo quiero ver los carros que aplican a esa promo",
            current_promotion_title="Mensualidad gratis en SUVs",
            numbered_promotion_lines="1. Mensualidad gratis en SUVs",
        )
        self.assertTrue(flags["ask_promotion_vehicle_info"])
        self.assertFalse(flags["apply_promotion"])

    def test_ask_other_promotions_flag(self) -> None:
        flags = lr.classify_promotions_step_flags(
            previous_bot_message="Estas son las promociones disponibles.",
            user_message="Muestrame otras promociones",
            current_promotion_title="",
            numbered_promotion_lines="1. Mensualidad gratis en SUVs\n2. Bono en efectivo",
        )
        self.assertTrue(flags["ask_promotions"])
        self.assertFalse(flags["apply_promotion"])


if __name__ == "__main__":
    unittest.main()

