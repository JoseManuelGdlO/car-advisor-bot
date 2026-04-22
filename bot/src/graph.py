"""Configuracion del StateGraph para el bot asesor de carros."""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from src.nodes.brand_selection import brand_selection
from src.nodes.car_selection import car_selection
from src.nodes.faq import faq
from src.nodes.intent_checker import intent_checker
from src.nodes.lead_capture import lead_capture
from src.nodes.router import router
from src.state import clientState


def _route_from_router(state: clientState) -> str:
    """Devuelve el nombre del siguiente nodo luego de `router`."""

    node = state.get("current_node", "router")
    if node == "faq":
        return "faq"
    if node == "brand_selection":
        return "brand_selection"
    if node == "car_selection":
        return "car_selection"
    if node == "lead_capture":
        return "lead_capture"
    return "end"


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
    graph.add_node("brand_selection", brand_selection)
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
            "brand_selection": "brand_selection",
            "car_selection": "car_selection",
            "lead_capture": "lead_capture",
            "faq": "faq",
            "end": END,
        },
    )

    graph.add_edge("brand_selection", END)
    graph.add_edge("car_selection", END)
    graph.add_edge("lead_capture", END)
    graph.add_edge("faq", END)

    return graph.compile()
