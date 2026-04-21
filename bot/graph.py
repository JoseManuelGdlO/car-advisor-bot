from langgraph.graph import END, START, StateGraph

from nodes import mock_node
from state import BotState


def build_graph():
    graph = StateGraph(BotState)
    graph.add_node("mock_node", mock_node)
    graph.add_edge(START, "mock_node")
    graph.add_edge("mock_node", END)
    return graph.compile()
