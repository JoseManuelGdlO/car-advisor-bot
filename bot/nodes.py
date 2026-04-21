from state import BotState


def mock_node(state: BotState) -> BotState:
    user_input = state.get("user_input", "")
    return {"response": f"Mock response para: {user_input}"}
