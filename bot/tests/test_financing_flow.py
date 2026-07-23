from __future__ import annotations

from contextlib import ExitStack
from unittest.mock import patch

from tests.test_helpers import GraphTestCase, initial_state, with_user_message

_FINANCING_STEP_FLAGS_DEFAULT = {
    "ask_promotions": False,
    "ask_other_vehicles": False,
    "ask_financing_with_vehicle": False,
    "wants_compare_two_plans": False,
    "select_plan": False,
    "ask_plan_vehicle_info": False,
    "reject_financing_keep_purchase": False,
    "ask_explicit_plan": True,
}


class FinancingFlowTests(GraphTestCase):
    def test_financing_rejects_plans_but_keeps_purchase_routes_to_lead_capture(self) -> None:
        state = initial_state()
        state["current_node"] = "financing"
        state["intent"] = "financing"
        state["awaiting_financing_plan_selection"] = True
        state["selected_vehicle_id"] = "veh-versa-2011"
        state["selected_car"] = "Nissan Versa 2011"
        state["financing_plan_candidates"] = [
            {
                "id": "plan-1",
                "name": "Financiamiento Shilo",
                "lender": "BBVA",
                "active": True,
                "vehicles": [{"id": "veh-versa-2011", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"}],
            },
            {
                "id": "plan-2",
                "name": "Test",
                "lender": "Test",
                "active": True,
                "vehicles": [{"id": "veh-versa-2011", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"}],
            },
        ]
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Si te interesa alguno, dime el nombre o numero del plan.",
                "type": "AIMessage",
            }
        ]

        state = with_user_message(state, "no pero no me interesa ninguno, solo quiero comprar el carro")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.intent_checker.maybe_escalate_financing_detail", return_value=None),
            patch(
                "src.nodes.financing.classify_financing_step_flags",
                return_value={
                    **_FINANCING_STEP_FLAGS_DEFAULT,
                    "reject_financing_keep_purchase": True,
                    "ask_explicit_plan": False,
                },
            ),
            patch(
                "src.nodes.financing.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
            patch(
                "src.nodes.lead_capture.generate_lead_capture_scheduling_message",
                return_value="Agenda en https://calendar.app.google/tYniJNfcrd8qXvut8",
            ),
            patch("src.nodes.lead_capture.notify_advisor"),
            patch("src.nodes.lead_capture.push_event_to_backend"),
            patch("src.nodes.lead_capture.deactivate_bot", side_effect=lambda s, **_: {**s, "bot_disabled": True}),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "router")
        self.assertTrue(updated.get("lead_capture_done"))
        self.assertFalse(updated.get("awaiting_financing_plan_selection"))
        self.assertEqual(updated.get("selected_financing_plan_id"), "")
        assistant_texts = [
            str(m.get("content", "")).lower()
            for m in updated.get("messages", [])
            if m.get("role") == "assistant"
        ]
        self.assertTrue(
            any("sin plan de financiamiento" in t for t in assistant_texts),
            msg="financing debe anunciar compra sin plan antes de que lead_capture siga en el mismo invoke",
        )

    def test_financing_requests_catalog_routes_to_car_selection(self) -> None:
        state = initial_state()
        state["current_node"] = "financing"
        state["intent"] = "financing"
        state["awaiting_financing_plan_selection"] = True
        state["financing_plan_candidates"] = [{"id": "plan-1", "name": "Plan Demo", "lender": "Banco", "active": True, "vehicles": []}]
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Si te interesa uno en particular, dime el nombre o numero del plan.",
                "type": "AIMessage",
            }
        ]

        state = with_user_message(state, "no mejor solo muestrame los modelos disponibles por favor")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch(
                "src.nodes.financing.classify_financing_step_flags",
                return_value={**_FINANCING_STEP_FLAGS_DEFAULT, "ask_other_vehicles": True, "ask_explicit_plan": False},
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertEqual(updated.get("intent"), "vehicle_catalog")
        self.assertFalse(updated.get("awaiting_financing_plan_selection"))

    def test_financing_plan_vehicle_info_routes_to_car_selection_detail(self) -> None:
        jimny_vehicle = {
            "id": "veh-jimny",
            "brand": "Suzuki",
            "model": "JIMNY 5-DOOR 2026",
            "year": 2026,
            "status": "available",
        }
        plan = {
            "id": "plan-suzuki",
            "name": "Oferta comercial Suzuki",
            "lender": "Santander",
            "active": True,
            "vehicles": [jimny_vehicle],
        }
        state = initial_state()
        state["current_node"] = "financing"
        state["intent"] = "financing"
        state["awaiting_financing_plan_selection"] = True
        state["selected_vehicle_id"] = "veh-jimny"
        state["selected_car"] = "Suzuki JIMNY 5-DOOR 2026 2026"
        state["financing_plan_candidates"] = [plan]
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Te interesa este plan? No olvides en preguntarme cualquier duda.",
                "type": "AIMessage",
            }
        ]

        state = with_user_message(state, "si me interesa el plan pero quiero mas informacion del vehiculo")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch(
                "src.nodes.financing.classify_financing_step_flags",
                return_value={
                    **_FINANCING_STEP_FLAGS_DEFAULT,
                    "ask_plan_vehicle_info": True,
                    "ask_explicit_plan": False,
                },
            ),
            patch("src.nodes.financing.classify_financing_plan_selection_intent", return_value="ASK_EXPLICIT_PLAN"),
            patch("src.nodes.financing.extract_financing_plan_selection_payload", return_value={}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[jimny_vehicle]),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=jimny_vehicle),
            patch(
                "src.nodes.car_selection.generate_vehicle_detail_conversation",
                return_value="Aqui tienes la informacion completa del Suzuki Jimny.",
            ),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "car_selection")
        self.assertTrue(updated.get("awaiting_purchase_preferences"))
        self.assertFalse(updated.get("awaiting_purchase_confirmation"))
        self.assertFalse(updated.get("show_selected_vehicle_detail_once"))
        self.assertTrue(updated.get("awaiting_financing_plan_selection"))
        assistant_texts = [
            str(m.get("content", ""))
            for m in updated.get("messages", [])
            if m.get("role") == "assistant"
        ]
        self.assertTrue(
            any("Automático o Estándar" in t for t in assistant_texts),
            msg="car_selection debe pedir preferencias antes del detalle",
        )

    def test_financing_requests_promotions_routes_to_promotions_not_faq(self) -> None:
        state = initial_state()
        state["current_node"] = "financing"
        state["intent"] = "financing"
        state["awaiting_financing_plan_selection"] = True
        state["financing_plan_candidates"] = [{"id": "plan-1", "name": "Plan Demo", "lender": "Banco", "active": True, "vehicles": []}]
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Si te interesa uno en particular, dime el nombre o numero del plan.",
                "type": "AIMessage",
            }
        ]

        state = with_user_message(state, "mejor cuentame si tienes promociones")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": True}),
            patch(
                "src.nodes.intent_checker.classify_financing_step_flags",
                return_value={**_FINANCING_STEP_FLAGS_DEFAULT, "ask_promotions": True, "ask_explicit_plan": False},
            ),
            patch(
                "src.nodes.financing.classify_financing_step_flags",
                return_value={**_FINANCING_STEP_FLAGS_DEFAULT, "ask_promotions": True, "ask_explicit_plan": False},
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "promotions")
        self.assertEqual(updated.get("intent"), "promotions")
        self.assertFalse(updated.get("is_faq_interrupt"))

    def test_financing_plan_selection_faq_buro_routes_to_faq(self) -> None:
        state = initial_state()
        state["current_node"] = "financing"
        state["intent"] = "financing"
        state["awaiting_financing_plan_selection"] = True
        state["selected_vehicle_id"] = "veh-dzire"
        state["selected_car"] = "Suzuki DZIRE BOOSTERGREEN 2026 2026"
        state["financing_plan_candidates"] = [
            {"id": "plan-1", "name": "Oferta comercial Suzuki", "lender": "Banco", "active": True, "vehicles": []}
        ]
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Si te interesa uno en particular, dime el nombre o numero del plan.",
                "type": "AIMessage",
            }
        ]

        state = with_user_message(state, "revisan buro de credito")
        with (
            patch(
                "src.nodes.intent_checker.classify_faq_interrupt_flags",
                return_value={"interrumpir_por_faq": True},
            ),
            patch(
                "src.nodes.intent_checker.classify_financing_step_flags",
                return_value=_FINANCING_STEP_FLAGS_DEFAULT,
            ),
            patch(
                "src.nodes.financing.classify_financing_step_flags",
                return_value=_FINANCING_STEP_FLAGS_DEFAULT,
            ),
            patch("src.nodes.faq.fetch_faq_candidates", return_value=["P: Buró?\nR: Sí revisamos."]),
            patch("src.nodes.faq.generate_faq_resume_transition", return_value="¿Seguimos con el plan?"),
            patch("src.nodes.faq.generate_faq_user_turn", return_value="Sí revisamos buró de crédito."),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("current_node"), "financing")
        self.assertFalse(updated.get("is_faq_interrupt"))
        self.assertIn("revisamos", updated["messages"][-1]["content"].lower())

    def test_financing_plan_vehicle_photos_send_images_via_llm(self) -> None:
        dzire_vehicle = {
            "id": "veh-dzire",
            "brand": "Suzuki",
            "model": "DZIRE BOOSTERGREEN 2026",
            "year": 2026,
            "status": "available",
        }
        plan = {
            "id": "plan-suzuki",
            "name": "Oferta comercial Suzuki",
            "lender": "Santander",
            "active": True,
            "vehicles": [dzire_vehicle],
        }
        state = initial_state()
        state["current_node"] = "financing"
        state["intent"] = "financing"
        state["awaiting_financing_plan_selection"] = True
        state["selected_vehicle_id"] = "veh-dzire"
        state["selected_car"] = "Suzuki DZIRE BOOSTERGREEN 2026 2026"
        state["financing_plan_candidates"] = [plan]
        state["messages"] = [
            {
                "role": "assistant",
                "content": "Si te interesa uno en particular, dime el nombre o numero del plan.",
                "type": "AIMessage",
            }
        ]

        vehicle_step_flags = {
            "ask_promotions": False,
            "ask_financing": False,
            "ask_images": True,
            "ask_more_images": False,
            "wants_compare_two_vehicles": False,
            "wants_other_vehicles": False,
            "confirm_purchase": False,
            "reject_purchase": False,
        }
        state = with_user_message(state, "me puedes enviar fotos del dzire")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch(
                "src.nodes.intent_checker.classify_financing_step_flags",
                return_value={
                    **_FINANCING_STEP_FLAGS_DEFAULT,
                    "ask_plan_vehicle_info": True,
                    "ask_explicit_plan": False,
                },
            ),
            patch(
                "src.nodes.financing.classify_financing_step_flags",
                return_value={
                    **_FINANCING_STEP_FLAGS_DEFAULT,
                    "ask_plan_vehicle_info": True,
                    "ask_explicit_plan": False,
                },
            ),
            patch("src.nodes.financing.classify_financing_plan_selection_intent", return_value="ASK_EXPLICIT_PLAN"),
            patch("src.nodes.financing.extract_financing_plan_selection_payload", return_value={}),
            patch("src.nodes.car_selection.fetch_vehicles", return_value=[dzire_vehicle]),
            patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=dzire_vehicle),
            patch("src.nodes.car_selection.classify_vehicle_step_flags", return_value=vehicle_step_flags),
            patch(
                "src.nodes.car_selection.generate_vehicle_detail_conversation",
                return_value="Aqui tienes la informacion completa del Suzuki Dzire.",
            ),
            patch(
                "src.nodes.car_selection.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
            patch(
                "src.utils.vehicle_images.fetch_vehicle_images",
                return_value={"images": ["/img/dzire-1.jpg"], "nextCursor": 1, "hasMore": False, "mode": "top"},
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertTrue(updated.get("awaiting_purchase_preferences"))
        self.assertEqual(updated.get("vehicle_images_last_batch") or [], [])
        assistant_texts = [
            str(m.get("content", ""))
            for m in updated.get("messages", [])
            if m.get("role") == "assistant"
        ]
        self.assertTrue(any("Automático o Estándar" in t for t in assistant_texts))
        self.assertFalse(any("/img/dzire-1.jpg" in t for t in assistant_texts))

    def test_financing_plan_selection_via_llm_extract_advances_flow(self) -> None:
        jimny_plan = {
            "id": "plan-jimny",
            "name": "Financiamiento Jimny 5 Puertas",
            "lender": "Santander",
            "active": True,
            "vehicles": [
                {
                    "id": "veh-jimny",
                    "brand": "Suzuki",
                    "model": "Jimny 5 Puertas",
                    "year": 2025,
                    "status": "available",
                }
            ],
        }
        other_plan = {
            "id": "plan-baleno",
            "name": "Financiamiento Baleno",
            "lender": "BBVA",
            "active": True,
            "vehicles": [
                {
                    "id": "veh-baleno",
                    "brand": "Suzuki",
                    "model": "Baleno",
                    "year": 2025,
                    "status": "available",
                }
            ],
        }
        state = initial_state()
        state["current_node"] = "financing"
        state["intent"] = "financing"
        state["awaiting_financing_plan_selection"] = True
        state["selected_vehicle_id"] = "veh-baleno"
        state["selected_car"] = "Suzuki Baleno GLX 2025"
        state["financing_plan_candidates"] = [other_plan, jimny_plan]
        state["messages"] = [
            {
                "role": "assistant",
                "content": (
                    "Si te interesa uno en particular, dime el nombre o numero del plan. "
                    "Despues te pedire seleccionar el vehiculo dentro de ese plan."
                ),
                "type": "AIMessage",
            }
        ]

        state = with_user_message(state, "Elijo el plan Jimny 5P")
        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch(
                "src.nodes.financing.classify_financing_step_flags",
                return_value={
                    **_FINANCING_STEP_FLAGS_DEFAULT,
                    "select_plan": True,
                    "ask_explicit_plan": False,
                },
            ),
            patch(
                "src.nodes.financing.extract_financing_plan_selection_payload",
                return_value={"no_match": False, "plan_index": None, "name_query": "jimny 5p"},
            ),
            patch(
                "src.nodes.financing.generate_financing_plans_user_message",
                side_effect=lambda **kw: kw.get("follow_up_hint") or kw.get("fallback_semantic") or "",
            ),
            patch(
                "src.nodes.financing.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
        ):
            updated = self.graph.invoke(state)

        self.assertEqual(updated.get("selected_financing_plan_id"), "plan-jimny")
        self.assertFalse(updated.get("awaiting_financing_plan_selection"))
        last_assistant = ""
        for message in reversed(updated.get("messages", [])):
            if message.get("role") == "assistant":
                last_assistant = str(message.get("content", "")).lower()
                break
        self.assertNotIn("dime cual plan te interesa", last_assistant)
        advanced = (
            updated.get("awaiting_financing_vehicle_selection")
            or updated.get("current_node") in ("car_selection", "lead_capture")
            or updated.get("selected_vehicle_id") == "veh-jimny"
        )
        self.assertTrue(advanced)

    def test_financing_multi_vehicle_to_lead_capture_notifies_and_returns_router(self) -> None:
        plan_a = {
            "id": "plan-a",
            "name": "Financiamiento Shilo",
            "lender": "BBVA",
            "active": True,
            "vehicles": [
                {"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"},
                {"id": "veh-2", "brand": "Nissan", "model": "Versa", "year": 2001, "status": "available"},
            ],
        }
        plan_b = {
            "id": "plan-b",
            "name": "Plan Premium",
            "lender": "Santander",
            "active": True,
            "vehicles": [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"}],
        }
        vehicle_hint = [{"id": "veh-1", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"}]
        state = initial_state()
        state["platform"] = "web"
        state["user_id"] = "5512345678"
        state["owner_user_id"] = "owner-test"

        def resolve_vehicle_hint(user_text: str, **_kwargs: object) -> dict[str, object] | None:
            return vehicle_hint[0] if "versa" in str(user_text).lower() else None

        with (
            patch("src.nodes.intent_checker.classify_faq_interrupt_flags", return_value={"interrumpir_por_faq": False}),
            patch("src.nodes.intent_checker.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.router.classify_router_intent", return_value="FINANCING"),
            patch("src.nodes.router.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.financing.maybe_escalate_financing_detail", return_value=None),
            patch("src.nodes.financing.resolve_single_vehicle_from_text", side_effect=resolve_vehicle_hint),
            patch("src.nodes.financing.fetch_financing_plans_by_vehicle", return_value=[plan_a, plan_b]),
            patch(
                "src.nodes.financing.classify_financing_step_flags",
                return_value=_FINANCING_STEP_FLAGS_DEFAULT,
            ),
            patch(
                "src.nodes.financing.generate_verified_user_message",
                side_effect=lambda **kw: kw["fallback"],
            ),
            patch(
                "src.nodes.lead_capture.generate_lead_capture_scheduling_message",
                return_value=(
                    "Agenda Nissan Versa 2001 en "
                    "https://calendar.app.google/tYniJNfcrd8qXvut8"
                ),
            ),
            patch("src.nodes.lead_capture.notify_advisor") as notify_mock,
            patch("src.nodes.lead_capture.push_event_to_backend") as event_mock,
            patch("src.nodes.lead_capture.deactivate_bot", side_effect=lambda s, **_: {**s, "bot_disabled": True}),
        ):
            state = self.graph.invoke(with_user_message(state, "quiero financiamiento para un versa 2011"))
            self.assertTrue(state.get("awaiting_financing_plan_selection"))

            state = self.graph.invoke(with_user_message(state, "1"))
            self.assertTrue(state.get("awaiting_financing_vehicle_selection"))

            state = self.graph.invoke(with_user_message(state, "2"))
            self.assertEqual(state.get("selected_vehicle_id"), "veh-2")
            self.assertTrue(state.get("lead_capture_done"))
            self.assertEqual(state.get("current_node"), "router")
            self.assertIn("calendar.app.google", state["messages"][-1]["content"])
            notify_mock.assert_called_once()
            event_mock.assert_called_once()

    def test_multiturn_versa_faq_interruption_to_financing_plan_and_lead_capture(self) -> None:
        versa_2011 = {
            "id": "veh-versa-2011",
            "brand": "Nissan",
            "model": "Versa",
            "year": 2011,
            "status": "available",
            "price": 3000000,
            "km": 0,
            "transmission": "si",
            "engine": "si",
            "color": "verde",
            "description": "Barato pa que salga",
        }
        versa_2001 = {
            "id": "veh-versa-2001",
            "brand": "Nissan",
            "model": "Versa",
            "year": 2001,
            "status": "available",
            "price": 1200000,
            "km": 90000,
            "transmission": "manual",
            "engine": "1.6",
            "color": "gris",
            "description": "",
        }
        shilo_plan = {
            "id": "plan-shilo",
            "name": "financiamiento shilo",
            "lender": "BBVA",
            "active": True,
            "vehicles": [{"id": "veh-versa-2011", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"}],
            "requirements": [{"title": "Cuenta de banco"}],
            "rate": 1.0,
            "showRate": True,
            "maxTermMonths": 12,
        }
        plan_test = {
            "id": "plan-test",
            "name": "Test",
            "lender": "Test",
            "active": True,
            "vehicles": [{"id": "veh-versa-2011", "brand": "Nissan", "model": "Versa", "year": 2011, "status": "available"}],
            "requirements": [{"title": "Requisito y cuenta de banco"}],
            "rate": 12.0,
            "showRate": True,
            "maxTermMonths": 48,
        }

        def faq_flags(_current_node: str, _last_bot: str, user_message: str, **_kwargs: object) -> dict[str, bool]:
            return {"interrumpir_por_faq": "ubicad" in user_message.lower()}

        state = initial_state()
        state["platform"] = "web"
        state["user_id"] = "5512345678"
        state["owner_user_id"] = "owner-multiturn"

        def resolve_vehicle_hint(user_text: str, **_kwargs: object) -> dict[str, object] | None:
            return versa_2011 if "versa" in str(user_text).lower() else None

        def pick_plan_from_state_side_effect(_state: object, user_text: str) -> dict[str, object] | None:
            if "financiamiento shilo" in user_text.lower():
                return shilo_plan
            return None

        with ExitStack() as stack:
            stack.enter_context(
                patch("src.nodes.intent_checker.maybe_escalate_financing_detail", return_value=None)
            )
            stack.enter_context(
                patch("src.nodes.router.maybe_escalate_financing_detail", return_value=None)
            )
            stack.enter_context(
                patch("src.nodes.financing.maybe_escalate_financing_detail", return_value=None)
            )
            stack.enter_context(
                patch("src.nodes.lead_capture.classify_lead_capture_navigation", return_value="")
            )
            stack.enter_context(
                patch("src.nodes.intent_checker.classify_faq_interrupt_flags", side_effect=faq_flags)
            )
            stack.enter_context(
                patch(
                    "src.nodes.faq.fetch_faq_candidates",
                    return_value=["Estamos ubicados por el colegio REX."],
                )
            )
            stack.enter_context(
                patch(
                    "src.nodes.faq.generate_faq_resume_transition",
                    return_value="¿Seguimos con el financiamiento?",
                )
            )
            stack.enter_context(
                patch(
                    "src.nodes.faq.generate_faq_user_turn",
                    return_value="Estamos ubicados por el colegio REX.",
                )
            )
            stack.enter_context(
                patch(
                    "src.nodes.car_selection.fetch_vehicles",
                    return_value=[versa_2011, versa_2001],
                )
            )
            stack.enter_context(
                patch(
                    "src.nodes.car_selection.search_vehicles",
                    side_effect=[[versa_2011, versa_2001], [versa_2011]],
                )
            )
            stack.enter_context(
                patch("src.nodes.car_selection.fetch_vehicle_by_id", return_value=versa_2011)
            )
            stack.enter_context(
                patch(
                    "src.nodes.car_selection.generate_vehicle_candidates_selection_message",
                    return_value="1. Nissan Versa 2011\n2. Nissan Versa 2001",
                )
            )
            stack.enter_context(
                patch(
                    "src.nodes.car_selection.generate_vehicle_detail_conversation",
                    return_value="Aqui tienes la información completa del Nissan Versa 2011. 😊",
                )
            )
            stack.enter_context(
                patch(
                    "src.nodes.car_selection._llm_vehicle_image_flags",
                    return_value={"ask_images": False, "ask_more_images": False},
                )
            )
            stack.enter_context(
                patch(
                    "src.nodes.car_selection.generate_verified_user_message",
                    side_effect=lambda **kw: kw["fallback"],
                )
            )
            stack.enter_context(
                patch(
                    "src.nodes.financing.resolve_single_vehicle_from_text",
                    side_effect=resolve_vehicle_hint,
                )
            )
            stack.enter_context(
                patch(
                    "src.nodes.financing.fetch_financing_plans_by_vehicle",
                    return_value=[shilo_plan, plan_test],
                )
            )
            stack.enter_context(
                patch(
                    "src.nodes.financing.classify_financing_step_flags",
                    return_value=_FINANCING_STEP_FLAGS_DEFAULT,
                )
            )
            stack.enter_context(
                patch(
                    "src.nodes.financing.generate_verified_user_message",
                    side_effect=lambda **kw: kw["fallback"],
                )
            )
            stack.enter_context(
                patch(
                    "src.nodes.financing.classify_financing_plan_selection_intent",
                    return_value="ASK_EXPLICIT_PLAN",
                )
            )
            stack.enter_context(
                patch(
                    "src.nodes.financing._pick_plan_from_state",
                    side_effect=pick_plan_from_state_side_effect,
                )
            )
            stack.enter_context(
                patch("src.nodes.financing.extract_financing_plan_selection_payload", return_value={})
            )
            stack.enter_context(
                patch(
                    "src.nodes.lead_capture.generate_lead_capture_scheduling_message",
                    return_value=(
                        "Agenda Nissan Versa 2011 en "
                        "https://calendar.app.google/tYniJNfcrd8qXvut8"
                    ),
                )
            )
            notify_mock = stack.enter_context(patch("src.nodes.lead_capture.notify_advisor"))
            event_mock = stack.enter_context(patch("src.nodes.lead_capture.push_event_to_backend"))
            stack.enter_context(
                patch(
                    "src.nodes.lead_capture.deactivate_bot",
                    side_effect=lambda s, **_: {**s, "bot_disabled": True},
                )
            )

            state = self.graph.invoke(with_user_message(state, "tienes carros versa?"))
            state = self.graph.invoke(with_user_message(state, "Cómo es el nissan versa 2011?"))
            self.assertTrue(state.get("awaiting_purchase_preferences"))
            state = self.graph.invoke(with_user_message(state, "automatico y financiado"))
            self.assertTrue(state.get("awaiting_purchase_confirmation"))
            state = self.graph.invoke(with_user_message(state, "dónde estan ubicados?"))
            self.assertIn("colegio REX", state["messages"][-1]["content"])

            state = self.graph.invoke(
                with_user_message(
                    state,
                    "si me interesa el vehiculo, pero no tienen planes de financiamiento?",
                )
            )
            self.assertEqual(state.get("current_node"), "financing")

            state = self.graph.invoke(with_user_message(state, "el shilo suena interesante"))
            self.assertEqual(state.get("selected_financing_plan_id"), "")

            state = self.graph.invoke(with_user_message(state, "el financiamiento shilo"))
            self.assertEqual(state.get("selected_financing_plan_id"), "plan-shilo")

            if not state.get("lead_capture_done"):
                state = self.graph.invoke(with_user_message(state, "si quiero agendar visita"))

            self.assertTrue(state.get("lead_capture_done"))
            self.assertEqual(state.get("current_node"), "router")
            self.assertIn("calendar.app.google", state["messages"][-1]["content"])
            notify_mock.assert_called_once()
            event_mock.assert_called_once()

