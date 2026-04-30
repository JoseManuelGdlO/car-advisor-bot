"""Configuracion del StateGraph para el bot asesor de carros."""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from src.nodes.car_selection import car_selection
from src.nodes.faq import faq
from src.nodes.financing import financing
from src.nodes.intent_checker import intent_checker
from src.nodes.lead_capture import lead_capture
from src.nodes.promotions import promotions
from src.nodes.router import router
from src.state import clientState


def _log_transition(origin: str, destination: str, details: str | None = None) -> None:
    """Imprime transiciones del grafo para debug de cada invoke."""

    if details:
        print(f"[GRAPH] {origin} -> {destination} ({details})")
        return
    print(f"[GRAPH] {origin} -> {destination}")


def _route_from_router(state: clientState) -> str:
    """Devuelve el nombre del siguiente nodo luego de `router`."""

    node = state.get("current_node", "router")
    intent = state.get("intent", "unknown")
    print(f"[GRAPH] route_from_router: current_node='{node}', intent='{intent}'")
    if node == "faq":
        _log_transition("router", "faq")
        return "faq"
    if node == "car_selection":
        _log_transition("router", "car_selection")
        return "car_selection"
    if node == "lead_capture":
        _log_transition("router", "lead_capture")
        return "lead_capture"
    if node == "financing":
        _log_transition("router", "financing")
        return "financing"
    if node == "promotions":
        _log_transition("router", "promotions")
        return "promotions"
    _log_transition("router", "end", "sin nodo valido")
    return "end"


def _route_after_intent_checker(state: clientState) -> str:
    """Define si se continua flujo o se enruta a FAQ interruptiva."""

    node = state.get("current_node", "router")
    if node == "faq":
        print("[GRAPH] route_after_intent_checker: FAQ detectada, redirigiendo a faq")
        _log_transition("intent_checker", "faq", "faq interruptiva")
        return "faq"
    if node == "lead_capture":
        print("[GRAPH] route_after_intent_checker: retomando lead_capture")
        _log_transition("intent_checker", "lead_capture", "reanudar flujo")
        return "lead_capture"
    if node == "car_selection":
        print("[GRAPH] route_after_intent_checker: retomando car_selection")
        _log_transition("intent_checker", "car_selection", "reanudar flujo")
        return "car_selection"
    if node == "financing":
        print("[GRAPH] route_after_intent_checker: retomando financing")
        _log_transition("intent_checker", "financing", "reanudar flujo")
        return "financing"
    if node == "promotions":
        print("[GRAPH] route_after_intent_checker: retomando promotions")
        _log_transition("intent_checker", "promotions", "reanudar flujo")
        return "promotions"
    print(f"[GRAPH] route_after_intent_checker: sin FAQ, continuando flujo (current_node='{node}')")
    _log_transition("intent_checker", "router")
    return "router"


def _route_after_car_selection(state: clientState) -> str:
    """Permite continuar a lead_capture cuando car_selection lo solicite."""

    node = state.get("current_node", "car_selection")
    if node == "lead_capture":
        _log_transition("car_selection", "lead_capture", "continuacion de compra")
        return "lead_capture"
    if node == "financing":
        _log_transition("car_selection", "financing", "consulta de financiamiento")
        return "financing"
    if node == "promotions":
        _log_transition("car_selection", "promotions", "consulta de promociones")
        return "promotions"
    _log_transition("car_selection", "end")
    return "end"


def _route_after_financing(state: clientState) -> str:
    """Permite continuar flujo cuando financing cambia de nodo destino."""

    node = state.get("current_node", "financing")
    if node == "car_selection":
        _log_transition("financing", "car_selection", "continuacion tras seleccionar plan")
        return "car_selection"
    if node == "lead_capture":
        _log_transition("financing", "lead_capture", "continuacion de compra")
        return "lead_capture"
    _log_transition("financing", "end")
    return "end"


def _route_after_promotions(state: clientState) -> str:
    """Permite continuar flujo cuando promotions cambia de nodo destino."""

    node = state.get("current_node", "promotions")
    if node == "car_selection":
        _log_transition("promotions", "car_selection", "continuacion hacia catalogo")
        return "car_selection"
    if node == "financing":
        _log_transition("promotions", "financing", "continuacion hacia financiamiento")
        return "financing"
    if node == "lead_capture":
        _log_transition("promotions", "lead_capture", "confirmacion de promocion + vehiculo")
        return "lead_capture"
    _log_transition("promotions", "end")
    return "end"


def _route_after_lead_capture(state: clientState) -> str:
    """Permite desviar lead_capture a otros nodos cuando el usuario cambia de tema."""

    node = state.get("current_node", "lead_capture")
    if node == "promotions":
        _log_transition("lead_capture", "promotions", "consulta de promociones")
        return "promotions"
    if node == "financing":
        _log_transition("lead_capture", "financing", "consulta de financiamiento")
        return "financing"
    if node == "car_selection":
        _log_transition("lead_capture", "car_selection", "consulta de otros vehiculos")
        return "car_selection"
    if node == "lead_capture":
        # El nodo espera una nueva respuesta del usuario (nombre/telefono/email).
        # Cerramos el invoke actual y en el siguiente turno intent_checker retomara lead_capture.
        _log_transition("lead_capture", "end", "esperando datos del usuario")
        return "end"
    _log_transition("lead_capture", "end")
    return "end"


def build_graph():
    """Construye y compila el grafo principal del bot."""

    graph = StateGraph(clientState)
    graph.add_node("router", router)
    graph.add_node("intent_checker", intent_checker)
    graph.add_node("car_selection", car_selection)
    graph.add_node("lead_capture", lead_capture)
    graph.add_node("faq", faq)
    graph.add_node("financing", financing)
    graph.add_node("promotions", promotions)

    graph.add_edge(START, "intent_checker")
    graph.add_conditional_edges(
        "intent_checker",
        _route_after_intent_checker,
        {
            "router": "router",
            "faq": "faq",
            "lead_capture": "lead_capture",
            "car_selection": "car_selection",
            "financing": "financing",
            "promotions": "promotions",
        },
    )
    graph.add_conditional_edges(
        "router",
        _route_from_router,
        {
            "car_selection": "car_selection",
            "lead_capture": "lead_capture",
            "faq": "faq",
            "financing": "financing",
            "promotions": "promotions",
            "end": END,
        },
    )

    graph.add_conditional_edges(
        "car_selection",
        _route_after_car_selection,
        {
            "lead_capture": "lead_capture",
            "financing": "financing",
            "promotions": "promotions",
            "end": END,
        },
    )
    graph.add_conditional_edges(
        "financing",
        _route_after_financing,
        {
            "car_selection": "car_selection",
            "lead_capture": "lead_capture",
            "end": END,
        },
    )
    graph.add_conditional_edges(
        "promotions",
        _route_after_promotions,
        {
            "car_selection": "car_selection",
            "financing": "financing",
            "lead_capture": "lead_capture",
            "end": END,
        },
    )
    graph.add_conditional_edges(
        "lead_capture",
        _route_after_lead_capture,
        {
            "promotions": "promotions",
            "financing": "financing",
            "car_selection": "car_selection",
            "end": END,
        },
    )
    graph.add_edge("faq", END)

    return graph.compile()
