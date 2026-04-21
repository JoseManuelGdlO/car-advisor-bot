"""Configuracion del StateGraph para el bot asesor de carros."""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from src.nodes.car_selection import car_selection
from src.nodes.category_selection import category_selection
from src.nodes.common import CAR_OPTIONS_BY_CATEGORY, CATEGORY_OPTIONS, is_faq_intent
from src.nodes.faq import faq
from src.nodes.intent_checker import intent_checker
from src.nodes.lead_capture import lead_capture
from src.state import clientState


def _latest_user_text(state: clientState) -> str:
    """Retorna el ultimo mensaje del usuario en minusculas."""

    for message in reversed(state.get("messages", [])):
        if message.get("role") == "user":
            return str(message.get("content", "")).strip().lower()
    return ""


def _last_three_messages_context(state: clientState) -> str:
    """Construye contexto corto (ultimos 3 mensajes) para ruteo determinista."""

    recent = state.get("messages", [])[-3:]
    formatted = []
    for msg in recent:
        role = msg.get("role", "unknown")
        content = str(msg.get("content", "")).strip()
        if content:
            formatted.append(f"{role}:{content}")
    return " | ".join(formatted).lower()


def router(state: clientState) -> clientState:
    """Router determinista basado en estado y ultimo input del usuario.

    Este nodo no responde al usuario; solo prepara `current_node` para elegir
    la siguiente transicion condicional del grafo.
    """

    user_text = _latest_user_text(state)
    short_context = _last_three_messages_context(state)
    current_node = state.get("current_node", "router")
    selected_category = state.get("selected_category", "")
    selected_car = state.get("selected_car", "")

    if is_faq_intent(user_text) or is_faq_intent(short_context):
        state["current_node"] = "faq"
        return state

    if current_node in {"start", "router", "category_selection"}:
        if user_text in [c.lower() for c in CATEGORY_OPTIONS]:
            normalized = next(c for c in CATEGORY_OPTIONS if c.lower() == user_text)
            state["selected_category"] = normalized
            state["current_node"] = "car_selection"
            return state
        state["current_node"] = "category_selection"
        return state

    if current_node == "car_selection" or selected_category:
        options = CAR_OPTIONS_BY_CATEGORY.get(selected_category, [])
        if user_text in [o.lower() for o in options]:
            normalized = next(o for o in options if o.lower() == user_text)
            state["selected_car"] = normalized
            state["current_node"] = "lead_capture"
            return state
        # Si aun no selecciona carro, regresar a mostrar opciones de carros.
        state["current_node"] = "car_selection"
        return state

    if selected_car:
        state["current_node"] = "lead_capture"
        return state

    state["current_node"] = "category_selection"
    return state


def _route_from_router(state: clientState) -> str:
    """Devuelve el nombre del siguiente nodo luego de `router`."""

    node = state.get("current_node", "category_selection")
    if node == "faq":
        return "faq"
    if node == "car_selection":
        return "car_selection"
    if node == "lead_capture":
        return "lead_capture"
    return "category_selection"


def _route_after_intent_checker(state: clientState) -> str:
    """Define si se continua flujo o se enruta a FAQ interruptiva."""

    if state.get("current_node") == "faq":
        return "faq"
    return "router"


def build_graph():
    """Construye y compila el grafo principal del bot."""

    graph = StateGraph(clientState)
    graph.add_node("router", router)
    graph.add_node("intent_checker", intent_checker)
    graph.add_node("category_selection", category_selection)
    graph.add_node("car_selection", car_selection)
    graph.add_node("lead_capture", lead_capture)
    graph.add_node("faq", faq)

    graph.add_edge(START, "intent_checker")
    graph.add_conditional_edges(
        "intent_checker",
        _route_after_intent_checker,
        {
            "router": "router",
            "faq": "faq",
        },
    )
    graph.add_conditional_edges(
        "router",
        _route_from_router,
        {
            "category_selection": "category_selection",
            "car_selection": "car_selection",
            "lead_capture": "lead_capture",
            "faq": "faq",
        },
    )

    graph.add_edge("category_selection", END)
    graph.add_edge("car_selection", END)
    graph.add_edge("lead_capture", END)
    graph.add_edge("faq", END)

    return graph.compile()
